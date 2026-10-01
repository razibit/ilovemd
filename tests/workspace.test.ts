import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceController } from "../apps/web/src/workspace-controller";
import { planPages } from "../apps/web/src/export-geometry";
import { defaultSettings } from "../packages/engine/src/types";
const doc = (id: string, revision = 0) => ({
  id,
  revision,
  source: `# ${id} ${revision}`,
  assets: {},
  settings: defaultSettings,
});
test("document queues preserve versions and dirty drafts across pending switches", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    writes: { id: string; expected?: string }[] = [];
  const c = new WorkspaceController(async (s, expected) => {
    writes.push({ id: s.id, expected });
    if (s.id === "a" && s.revision === 1) await gate;
    return `${s.id}-${s.revision}`;
  });
  c.restore(doc("a"), "a-0");
  c.restore(doc("b"), "b-0");
  const first = c.flush(doc("a", 1)),
    next = c.flush(doc("a", 2));
  await c.flush(doc("b", 1));
  assert.equal(c.drafts.get("a")!.revision, 2);
  assert.equal(c.versions.get("b"), "b-1");
  release();
  await first;
  await next;
  assert.deepEqual(writes, [
    { id: "a", expected: "a-0" },
    { id: "b", expected: "b-0" },
    { id: "a", expected: "a-1" },
  ]);
});
test("failed saves retain recoverable drafts and cannot advance optimistic versions", async () => {
  let fails = true;
  const c = new WorkspaceController(async () => {
    if (fails) throw new Error("quota");
    return "saved";
  });
  const original = doc("a");
  c.restore(original, "old");
  const edit = doc("a", 1);
  await assert.rejects(c.flush(edit), /quota/);
  c.evict("a");
  assert.equal(c.drafts.get("a"), edit);
  assert.equal(c.versions.get("a"), "old");
  fails = false;
  await c.flush(edit);
  assert.equal(c.versions.get("a"), "saved");
  c.evict("a");
  assert.equal(c.drafts.has("a"), false);
});
test("deleting a queued document prevents queued writes and leaves other documents intact", async () => {
  const writes: string[] = [];
  const c = new WorkspaceController(async (s) => {
    writes.push(s.id);
    return "v";
  });
  const pending = c.flush(doc("a"));
  await c.remove("a");
  await pending;
  await c.flush(doc("b"));
  assert.deepEqual(writes, ["b"]);
  assert.equal(c.drafts.has("a"), false);
});
test("page plans retain line geometry, forced breaks and exact full coverage", () => {
  const slices = planPages(1300, 500, [
    { top: 480, bottom: 520 },
    { top: 900, bottom: 900, break: true },
  ]);
  assert.deepEqual(slices, [
    { y: 0, height: 480 },
    { y: 480, height: 420 },
    { y: 900, height: 400 },
  ]);
  assert.equal(
    slices.reduce((n, s) => n + s.height, 0),
    1300,
  );
  assert.throws(() => planPages(100, 0, []), /dimensions/);
  assert.throws(() => planPages(2010, 10, []), /200 pages/);
  assert.equal(
    planPages(900, 500, [
      { top: 450, bottom: 450, break: true },
      { top: 300, bottom: 300, break: true },
    ])[0].height,
    300,
  );
});

test("failed deletion can resume the original version and retained draft", async () => {
  const expected: (string | undefined)[] = [];
  const c = new WorkspaceController(async (_s, version) => {
    expected.push(version);
    return "next";
  });
  c.restore(doc("a"), "original");
  const draft = doc("a", 1);
  c.retain(draft);
  await c.suspend("a");
  await c.flush(draft);
  assert.equal(expected.length, 0);
  assert.equal(c.drafts.get("a"), draft);
  c.resume("a");
  await c.flush(draft);
  assert.deepEqual(expected, ["original"]);
});
