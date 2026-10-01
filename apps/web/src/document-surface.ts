import type { AnnotationSet } from "../../../packages/engine/src/annotations";
export type DocumentLayout = AnnotationSet["layout"];
export const STYLE_IDENTITY = "document-surface-2";
export function measureLayout(el: HTMLElement): DocumentLayout {
  const css = getComputedStyle(el);
  return {
    geometryVersion: 2,
    styleIdentity: STYLE_IDENTITY,
    width: parseFloat(css.width),
    height: parseFloat(css.height),
    mediaWidth: innerWidth,
    fontSize: parseFloat(css.fontSize),
    lineHeight: parseFloat(css.lineHeight) / parseFloat(css.fontSize),
    fontFamily: css.fontFamily,
    padding: [
      css.paddingTop,
      css.paddingRight,
      css.paddingBottom,
      css.paddingLeft,
    ].map(parseFloat),
    border: [
      css.borderTopWidth,
      css.borderRightWidth,
      css.borderBottomWidth,
      css.borderLeftWidth,
    ].map(parseFloat),
    borderColor: css.borderTopColor,
    columns:
      Number(
        getComputedStyle(el.querySelector(".folio-columns") ?? el).columnCount,
      ) || (innerWidth <= 650 ? 1 : 2),
    theme: el.dataset.theme === "dark" ? "dark" : "light",
  };
}
export function applyLayout(el: HTMLElement, layout: DocumentLayout) {
  el.dataset.annotated = "true";
  el.style.cssText = `box-sizing:border-box;max-width:none;width:${layout.width}px;min-height:${layout.height}px;padding:${layout.padding.map((v) => `${v}px`).join(" ")};border-style:solid;border-width:${(layout.border ?? [1, 1, 1, 1]).map((v) => `${v}px`).join(" ")};border-color:${layout.borderColor ?? "var(--rule)"};--doc-font:${layout.fontSize}px;--doc-leading:${layout.lineHeight};--annotation-columns:${layout.columns ?? ((layout.mediaWidth ?? 1440) <= 650 ? 1 : 2)}`;
  if (layout.fontFamily) el.style.fontFamily = layout.fontFamily;
}
export function verifyGeometry(article: HTMLElement, set: AnnotationSet) {
  if (set.layout.styleIdentity && set.layout.styleIdentity !== STYLE_IDENTITY)
    throw new Error(
      "The annotated layout uses different document styles. Review the preserved revision and adopt its notes before exporting.",
    );
  const origin = article.getBoundingClientRect();
  for (const block of set.blocks ?? []) {
    const el = article.querySelector<HTMLElement>(`#${CSS.escape(block.id)}`);
    if (!el)
      throw new Error(
        `Annotated block ${block.id} is missing. Review the preserved revision.`,
      );
    const r = el.getBoundingClientRect();
    if (
      Math.max(
        Math.abs(r.x - origin.x - block.x),
        Math.abs(r.y - origin.y - block.y),
        Math.abs(r.width - block.width),
        Math.abs(r.height - block.height),
      ) > 1
    )
      throw new Error(
        `Annotated block ${block.id} changed layout. Wait for resources or review and adopt the preserved notes.`,
      );
  }
}
