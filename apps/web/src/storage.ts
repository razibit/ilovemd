import { openDB } from "idb";
import type { DocumentSnapshot } from "@folio/engine";
import {
  validateAnnotations,
  type AnnotationSet,
} from "../../../packages/engine/src/annotations";
export interface Saved {
  snapshot: DocumentSnapshot;
  version: string;
  at: number;
  key: string;
}
export interface WorkspaceDocument {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  session: Record<string, unknown>;
}
export function documentTitle(s: DocumentSnapshot) {
  return s.source.match(/^#\s+(.+)$/m)?.[1] || "Untitled document";
}
function valid(s: DocumentSnapshot) {
  return (
    s &&
    typeof s.id === "string" &&
    typeof s.source === "string" &&
    Number.isFinite(s.revision) &&
    s.settings &&
    s.assets
  );
}
export const dbPromise = openDB("folio", 4, {
  upgrade(db, old, _next, tx) {
    if (!db.objectStoreNames.contains("heads")) db.createObjectStore("heads");
    if (!db.objectStoreNames.contains("history"))
      db.createObjectStore("history", { keyPath: "key" });
    if (!db.objectStoreNames.contains("preferences"))
      db.createObjectStore("preferences");
    if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets");
    if (!db.objectStoreNames.contains("annotations"))
      db.createObjectStore("annotations", { keyPath: "id" });
    db.createObjectStore("documents", { keyPath: "id" });
    db.createObjectStore("workspace");
    tx.objectStore("history").createIndex("documentId", "snapshot.id");
    tx.objectStore("annotations").createIndex("documentId", "documentId");
    // Upgrade writes are atomic. Interrupted migrations roll back; damaged originals remain available.
    void (async () => {
      const heads = tx.objectStore("heads"),
        current = (await heads.get("current")) as Saved | undefined;
      const candidates = new Map<string, Saved>();
      const fromHistory = new Set<string>();
      const created = new Map<string, number>();
      const orphanRank = new Map<string, number>();
      for (const r of (await tx.objectStore("history").getAll()) as Saved[])
        if (valid(r?.snapshot)) {
          const at = Number.isFinite(r.at) ? r.at : Date.now();
          fromHistory.add(r.snapshot.id);
          created.set(
            r.snapshot.id,
            Math.min(created.get(r.snapshot.id) ?? at, at),
          );
          if (
            !candidates.has(r.snapshot.id) ||
            candidates.get(r.snapshot.id)!.at < at
          )
            candidates.set(r.snapshot.id, { ...r, at });
        }
      for (const s of (await tx
        .objectStore("annotations")
        .getAll()) as AnnotationSet[])
        if (
          valid(s?.snapshot) &&
          s.snapshot.id === s.documentId &&
          !fromHistory.has(s.documentId) &&
          (!candidates.has(s.documentId) ||
            (orphanRank.get(s.documentId) ?? -Infinity) <
              (s.updatedAt ?? s.revision))
        ) {
          orphanRank.set(s.documentId, s.updatedAt ?? s.revision);
          candidates.set(s.documentId, {
            snapshot: s.snapshot,
            version: crypto.randomUUID(),
            at: s.updatedAt ?? Date.now(),
            key: crypto.randomUUID(),
          });
        }
      if (current && valid(current.snapshot))
        candidates.set(current.snapshot.id, current);
      const prefs = await tx.objectStore("preferences").get("settings");
      for (const [id, r] of candidates) {
        await heads.put(r, id);
        await tx.objectStore("documents").put({
          id,
          title: documentTitle(r.snapshot),
          createdAt: created.get(id) ?? r.at,
          updatedAt: r.at,
          session: old ? { prefs } : {},
        });
      }
      const active =
        current && valid(current.snapshot)
          ? current.snapshot.id
          : candidates.keys().next().value;
      if (active) await tx.objectStore("workspace").put(active, "active");
      // Retain the original legacy head for manual recovery.
    })().catch(() => tx.abort());
  },
  blocked() {
    console.warn("Close older iLoveMd tabs to finish workspace migration.");
  },
  blocking() {
    void dbPromise.then((db) => db.close());
  },
});
void dbPromise.catch(() => {});
async function hydrate(r: Saved): Promise<Saved> {
  const db = await dbPromise,
    snapshot = structuredClone(r.snapshot);
  for (const a of Object.values(snapshot.assets))
    if (a.data.startsWith("idb:")) {
      const data = await db.get("assets", a.data.slice(4));
      if (!data)
        throw new Error(
          `Stored image is missing: ${a.name}. Import a backup bundle.`,
        );
      a.data = data;
    }
  return { ...r, snapshot };
}
export async function listDocuments(
  onBatch?: (documents: WorkspaceDocument[]) => void,
): Promise<WorkspaceDocument[]> {
  const db = await dbPromise,
    tx = db.transaction("documents"),
    documents: WorkspaceDocument[] = [];
  let cursor = await tx.store.openCursor();
  while (cursor) {
    documents.push(cursor.value);
    if (documents.length % 128 === 0)
      onBatch?.([...documents].sort((a, b) => a.createdAt - b.createdAt));
    cursor = await cursor.continue();
  }
  await tx.done;
  return documents.sort((a, b) => a.createdAt - b.createdAt);
}
export async function activateDocument(id: string) {
  await (await dbPromise).put("workspace", id, "active");
}
export async function restore(id?: string): Promise<Saved | undefined> {
  const db = await dbPromise,
    key = id ?? (await db.get("workspace", "active")),
    r = key ? await db.get("heads", key) : undefined;
  return r ? hydrate(r) : undefined;
}
export async function writeDocument(meta: WorkspaceDocument) {
  const db = await dbPromise,
    tx = db.transaction(["documents", "workspace"], "readwrite");
  if (await tx.objectStore("workspace").get(`deleted:${meta.id}`))
    throw new Error(
      "Document was deleted in another tab. Your draft remains in this session.",
    );
  const current = (await tx.objectStore("documents").get(meta.id)) as
    | WorkspaceDocument
    | undefined;
  await tx.objectStore("documents").put({
    ...meta,
    title:
      current && current.updatedAt > meta.updatedAt
        ? current.title
        : meta.title,
    createdAt: current?.createdAt ?? meta.createdAt,
    updatedAt: Math.max(current?.updatedAt ?? 0, meta.updatedAt),
  });
  await tx.done;
}
export async function save(snapshot: DocumentSnapshot, expected?: string) {
  const db = await dbPromise,
    tx = db.transaction(
      ["heads", "history", "assets", "documents", "workspace"],
      "readwrite",
    );
  if (await tx.objectStore("workspace").get(`deleted:${snapshot.id}`)) {
    await tx.done;
    throw new Error(
      "Document was deleted in another tab. Export your retained draft.",
    );
  }
  const current = (await tx.objectStore("heads").get(snapshot.id)) as
      | Saved
      | undefined,
    stored = structuredClone(snapshot);
  for (const a of Object.values(stored.assets)) {
    await tx.objectStore("assets").put(a.data, a.path);
    a.data = `idb:${a.path}`;
  }
  const r: Saved = {
    snapshot: stored,
    version: crypto.randomUUID(),
    at: Date.now(),
    key: crypto.randomUUID(),
  };
  await tx.objectStore("history").put(r);
  const conflict = !!current && current.version !== expected;
  if (!conflict) {
    await tx.objectStore("heads").put(r, snapshot.id);
    const meta = await tx.objectStore("documents").get(snapshot.id);
    await tx.objectStore("documents").put(
      meta
        ? { ...meta, updatedAt: r.at }
        : {
            id: snapshot.id,
            title: documentTitle(snapshot),
            createdAt: r.at,
            updatedAt: r.at,
            session: {},
          },
    );
  }
  const own = (
    (await tx
      .objectStore("history")
      .index("documentId")
      .getAll(snapshot.id)) as Saved[]
  ).sort((a, b) => b.at - a.at);
  for (const item of own.slice(50))
    await tx.objectStore("history").delete(item.key);
  await tx.done;
  if (conflict)
    throw new Error(
      "Another tab saved a newer document. Your draft is retained in Local history and this session.",
    );
  return r.version;
}
export async function history(id?: string) {
  const db = await dbPromise,
    records = (
      id
        ? await db.getAllFromIndex("history", "documentId", id)
        : await db.getAll("history")
    ) as Saved[];
  return Promise.all(records.sort((a, b) => b.at - a.at).map(hydrate));
}
export async function readAnnotations(id: string): Promise<AnnotationSet[]> {
  const sets = (await (
    await dbPromise
  ).getAllFromIndex("annotations", "documentId", id)) as AnnotationSet[];
  const restored = await Promise.all(
    sets.map(async (s) => {
      try {
        const value = {
          ...s,
          snapshot: (await hydrate({ snapshot: s.snapshot } as Saved)).snapshot,
        };
        validateAnnotations(value, value.snapshot);
        return value;
      } catch (e) {
        console.warn("Ignoring invalid stored annotation set", e);
        return null;
      }
    }),
  );
  return restored.filter((s): s is AnnotationSet => s !== null);
}
export async function saveAnnotations(set: AnnotationSet, expected?: string) {
  validateAnnotations(set, set.snapshot);
  const db = await dbPromise,
    tx = db.transaction(
      ["annotations", "assets", "workspace", "documents"],
      "readwrite",
    );
  if (await tx.objectStore("workspace").get(`deleted:${set.documentId}`)) {
    await tx.done;
    throw new Error(
      "These notes belong to a deleted document. Download a backup.",
    );
  }
  const existing = (await tx.objectStore("annotations").get(set.id)) as
    | AnnotationSet
    | undefined;
  if (existing && existing.version !== expected) {
    await tx.done;
    throw new Error(
      "Another tab changed these notes. Download your backup and reload before retrying.",
    );
  }
  const stored = structuredClone(set);
  for (const a of Object.values(stored.snapshot.assets)) {
    await tx.objectStore("assets").put(a.data, a.path);
    a.data = `idb:${a.path}`;
  }
  await tx.objectStore("annotations").put(stored);
  const meta = await tx.objectStore("documents").get(set.documentId);
  if (meta)
    await tx.objectStore("documents").put({
      ...meta,
      updatedAt: Math.max(meta.updatedAt, set.updatedAt ?? Date.now()),
    });
  await tx.done;
}
export async function deleteDocument(id: string) {
  const db = await dbPromise,
    tx = db.transaction(
      ["documents", "heads", "history", "annotations", "workspace"],
      "readwrite",
    );
  await tx.objectStore("workspace").put(true, `deleted:${id}`);
  await tx.objectStore("documents").delete(id);
  await tx.objectStore("heads").delete(id);
  const legacy = (await tx.objectStore("heads").get("current")) as
    | Saved
    | undefined;
  if (legacy?.snapshot?.id === id)
    await tx.objectStore("heads").delete("current");
  for (const key of await tx
    .objectStore("history")
    .index("documentId")
    .getAllKeys(id))
    await tx.objectStore("history").delete(key);
  for (const key of await tx
    .objectStore("annotations")
    .index("documentId")
    .getAllKeys(id))
    await tx.objectStore("annotations").delete(key);
  await tx.done;
}
export async function readPreferences() {
  return (await dbPromise).get("preferences", "settings");
}
export async function writePreferences(value: unknown) {
  await (await dbPromise).put("preferences", value, "settings");
}
