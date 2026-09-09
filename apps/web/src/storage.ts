import { openDB } from "idb";
import type { DocumentSnapshot } from "@folio/engine";
import { validateAnnotations, type AnnotationSet } from '../../../packages/engine/src/annotations';
const dbPromise = openDB("folio", 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("heads")) db.createObjectStore("heads");
    if (!db.objectStoreNames.contains("history"))
      db.createObjectStore("history", { keyPath: "key" });
    if (!db.objectStoreNames.contains("preferences"))
      db.createObjectStore("preferences");
    if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets");
    if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations', { keyPath: 'id' });
  },
});
// Attach a rejection handler immediately; callers still receive the actual failure.
void dbPromise.catch(() => {});
export async function readAnnotations(documentId: string): Promise<AnnotationSet[]> {
  const sets = await (await dbPromise).getAll('annotations') as AnnotationSet[];
  const restored = await Promise.all(
    sets.filter(s => s.documentId === documentId).map(async s => {
      try {
        const value = { ...s, snapshot: (await hydrate({ snapshot: s.snapshot } as Saved)).snapshot };
        validateAnnotations(value, value.snapshot);
        return value;
      } catch (error) {
        // A legacy or damaged record must not make every other note set for
        // this document unavailable. It remains in IndexedDB for recovery.
        console.warn("Ignoring invalid stored annotation set", error);
        return null;
      }
    }),
  );
  return restored.filter((value): value is AnnotationSet => value !== null);
}
export async function saveAnnotations(set: AnnotationSet, expected?: string) {
  validateAnnotations(set, set.snapshot);
  const db = await dbPromise;
  const tx = db.transaction(['annotations', 'assets'], 'readwrite');
  const existing = await tx.objectStore('annotations').get(set.id) as AnnotationSet | undefined;
  if (existing && existing.version !== expected) {
    await tx.done;
    throw new Error('Another tab changed these notes. Download your backup and reload before retrying.');
  }
  const stored = structuredClone(set);
  for (const asset of Object.values(stored.snapshot.assets)) {
    await tx.objectStore('assets').put(asset.data, asset.path);
    asset.data = `idb:${asset.path}`;
  }
  await tx.objectStore('annotations').put(stored);
  await tx.done;
}
export interface Saved {
  snapshot: DocumentSnapshot;
  version: string;
  at: number;
  key: string;
}
export async function restore(): Promise<Saved | undefined> {
  const saved = await (await dbPromise).get("heads", "current");
  return saved ? hydrate(saved) : undefined;
}
async function hydrate(record: Saved): Promise<Saved> {
  const db = await dbPromise;
  const snapshot = structuredClone(record.snapshot);
  for (const asset of Object.values(snapshot.assets)) {
    if (asset.data.startsWith("idb:")) {
      const data = await db.get("assets", asset.data.slice(4));
      if (!data)
        throw new Error(
          `Stored image is missing: ${asset.name}. Import a backup bundle.`,
        );
      asset.data = data;
    }
  }
  return { ...record, snapshot };
}
export async function save(snapshot: DocumentSnapshot, expected?: string) {
  const db = await dbPromise;
  const tx = db.transaction(["heads", "history", "assets"], "readwrite");
  const current = (await tx.objectStore("heads").get("current")) as
    | Saved
    | undefined;
  const stored = structuredClone(snapshot);
  for (const asset of Object.values(stored.assets)) {
    await tx.objectStore("assets").put(asset.data, asset.path);
    asset.data = `idb:${asset.path}`;
  }
  const record: Saved = {
    snapshot: stored,
    version: crypto.randomUUID(),
    at: Date.now(),
    key: crypto.randomUUID(),
  };
  await tx.objectStore("history").put(record);
  const conflict = !!current && current.version !== expected;
  if (!conflict) await tx.objectStore("heads").put(record, "current");
  const all = (await tx.objectStore("history").getAll()) as Saved[];
  const own = all
    .filter((x) => x.snapshot.id === snapshot.id)
    .sort((a, b) => b.at - a.at);
  for (const item of own.slice(50))
    await tx.objectStore("history").delete(item.key);
  await tx.done;
  if (conflict)
    throw new Error(
      "Another tab saved a newer document. Your version is retained in Local history. Reload to use the newer document or export your copy.",
    );
  return record.version;
}
export async function history() {
  const records = ((await (await dbPromise).getAll("history")) as Saved[]).sort(
    (a, b) => b.at - a.at,
  );
  return Promise.all(records.map(hydrate));
}
export async function readPreferences() {
  return (await dbPromise).get("preferences", "settings");
}
export async function writePreferences(value: unknown) {
  await (await dbPromise).put("preferences", value, "settings");
}
