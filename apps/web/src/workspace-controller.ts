import type { DocumentSnapshot } from "@folio/engine";

/** Queues and optimistic versions belong to document IDs, never to the active tab. */
export class WorkspaceController {
  drafts = new Map<string, DocumentSnapshot>();
  versions = new Map<string, string>();
  private queues = new Map<string, Promise<unknown>>();
  private saved = new Map<string, DocumentSnapshot>();
  private deleted = new Set<string>();
  constructor(
    private persist: (
      snapshot: DocumentSnapshot,
      expected?: string,
    ) => Promise<string>,
  ) {}
  restore(snapshot: DocumentSnapshot, version: string) {
    this.drafts.set(snapshot.id, snapshot);
    this.versions.set(snapshot.id, version);
    this.saved.set(snapshot.id, snapshot);
  }
  retain(snapshot: DocumentSnapshot) {
    if (!this.deleted.has(snapshot.id)) this.drafts.set(snapshot.id, snapshot);
  }
  flush(snapshot: DocumentSnapshot): Promise<void> {
    this.retain(snapshot);
    const previous = this.queues.get(snapshot.id) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        if (
          this.deleted.has(snapshot.id) ||
          this.saved.get(snapshot.id) === snapshot
        )
          return;
        const version = await this.persist(
          snapshot,
          this.versions.get(snapshot.id),
        );
        this.versions.set(snapshot.id, version);
        this.saved.set(snapshot.id, snapshot);
        // Clean inactive documents can be evicted; dirty drafts remain recoverable.
      });
    this.queues.set(snapshot.id, next);
    return next;
  }
  async suspend(id: string) {
    this.deleted.add(id);
    await this.queues.get(id)?.catch(() => {});
  }
  resume(id: string) {
    this.deleted.delete(id);
  }
  async remove(id: string) {
    await this.suspend(id);
    this.drafts.delete(id);
    this.saved.delete(id);
    this.versions.delete(id);
    this.queues.delete(id);
  }
  evict(id: string) {
    if (this.drafts.get(id) === this.saved.get(id)) {
      this.drafts.delete(id);
      this.saved.delete(id);
    }
  }
}
