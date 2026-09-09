import { expect, type Page, type Locator } from "@playwright/test";
/** CodeMirror virtualizes its DOM: fill() can replace only the mounted lines. */
export async function replaceEditor(editor: Locator, source: string) {
  await editor.focus();
  await editor.press("Control+a");
  await editor.press("Backspace");
  if (source) await editor.page().keyboard.insertText(source);
}

export async function openZoom(page: Page) {
  const trigger = page.locator(".zoom-button");
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
}
export async function closeZoom(page: Page) {
  const trigger = page.locator(".zoom-button");
  if (await trigger.getAttribute("aria-expanded") === "true") await trigger.click();
}
export async function toggleAnnotations(page: Page) {
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
}
export async function expectNotesSaved(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const ids = [...new Set([...document.querySelectorAll(".annotation-layer [data-note-id]")].map(e => e.getAttribute("data-note-id")))].sort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("folio"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      const sets = await new Promise<any[]>((resolve, reject) => {
        const r = db.transaction("annotations").objectStore("annotations").getAll();
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      return sets.some(s => JSON.stringify(s.objects.map((o: {id:string}) => o.id).sort()) === JSON.stringify(ids));
    } finally { db.close(); }
  })).toBe(true);
}
