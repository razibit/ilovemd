import type { DocumentSnapshot } from "./types";

export type DrawingTool =
  | "pen"
  | "marker"
  | "highlighter"
  | "underline"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse";
export type Point = { x: number; y: number; pressure?: number };
export interface Annotation {
  id: string;
  tool: DrawingTool;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
}
export interface AnnotationSet {
  schema: 1;
  id: string;
  documentId: string;
  revision: number;
  version: string;
  snapshot: DocumentSnapshot;
  previewHtml?: string;
  contextKey?: string;
  updatedAt?: number;
  blocks?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  layout: {
    mediaWidth?: number;
    width: number;
    height: number;
    fontSize: number;
    lineHeight: number;
    padding: number[];
    theme: "light" | "dark";
  };
  objects: Annotation[];
}
/** The export request already carries the document snapshot and assets. */
export type AnnotationExportPayload = Omit<AnnotationSet, 'snapshot' | 'previewHtml'> & { snapshot?: DocumentSnapshot };
export function bounds(a: Annotation) {
  const xs = a.points.map((p) => p.x),
    ys = a.points.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
export function moveAnnotation(
  a: Annotation,
  dx: number,
  dy: number,
): Annotation {
  return {
    ...a,
    points: a.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  };
}
export function annotationSvg(a: Annotation): string {
  const first = a.points[0],
    last = a.points.at(-1)!;
  const b = bounds(a);
  const style = `fill="none" stroke="${a.color}" stroke-width="${a.width}" stroke-linecap="round" stroke-linejoin="round"`;
  let shape: string;
  if (a.tool === "rectangle")
    shape = `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" ${style}/>`;
  else if (a.tool === "ellipse")
    shape = `<ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" ${style}/>`;
  else {
    shape =
      a.tool === "pen" && a.points.some((p) => p.pressure !== undefined)
        ? a.points
            .slice(1)
            .map(
              (p, i) =>
                `<path d="M${a.points[i].x},${a.points[i].y} L${p.x},${p.y}" ${style.replace(`stroke-width="${a.width}"`, `stroke-width="${a.width * (0.25 + (p.pressure ?? 0.5) * 1.5)}"`)}/>`,
            )
            .join("")
        : `<path d="M${a.points.map((p) => `${p.x},${p.y}`).join(" L")}" ${style}/>`;
    if (a.tool === "arrow") {
      const angle = Math.atan2(last.y - first.y, last.x - first.x),
        size = Math.max(10, a.width * 4);
      shape += `<path d="M${last.x - size * Math.cos(angle - 0.5)},${last.y - size * Math.sin(angle - 0.5)} L${last.x},${last.y} L${last.x - size * Math.cos(angle + 0.5)},${last.y - size * Math.sin(angle + 0.5)}" ${style}/>`;
    }
  }
  return `<g opacity="${a.opacity}">${shape}</g>`;
}
export function overlaySvg(set: AnnotationSet) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${set.layout.width}" height="${set.layout.height}" viewBox="0 0 ${set.layout.width} ${set.layout.height}" style="position:absolute;inset:0;pointer-events:none;overflow:visible">${set.objects.map(annotationSvg).join("")}</svg>`;
}
export function validateAnnotations(
  set: AnnotationSet,
  snapshot: DocumentSnapshot,
) {
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (
    !set ||
    set.schema !== 1 ||
    typeof set.id !== "string" ||
    typeof set.version !== "string" ||
    set.documentId !== snapshot.id ||
    set.snapshot?.source !== snapshot.source ||
    JSON.stringify(set.snapshot.settings) !==
      JSON.stringify(snapshot.settings) ||
    JSON.stringify(set.snapshot.assets) !== JSON.stringify(snapshot.assets)
  )
    throw new Error("Annotations do not match this document revision.");
  const l = set.layout;
  if (
    !l ||
    (l.mediaWidth !== undefined &&
      (!finite(l.mediaWidth) || l.mediaWidth < 1 || l.mediaWidth > 20000)) ||
    ![l.width, l.height, l.fontSize, l.lineHeight].every(finite) ||
    l.width < 100 ||
    l.width > 10000 ||
    l.height < 1 ||
    l.height > 2000000 ||
    l.fontSize < 8 ||
    l.fontSize > 72 ||
    l.lineHeight < 1 ||
    l.lineHeight > 4 ||
    !["light", "dark"].includes(l.theme) ||
    !Array.isArray(l.padding) ||
    l.padding.length !== 4 ||
    l.padding.some((x) => !finite(x) || x < 0 || x > 200)
  )
    throw new Error("Invalid annotation layout.");
  if (
    set.blocks &&
    (!Array.isArray(set.blocks) ||
      set.blocks.length > 20000 ||
      set.blocks.some(
        (b) =>
          !b ||
          typeof b.id !== "string" ||
          ![b.x, b.y, b.width, b.height].every(finite),
      ))
  )
    throw new Error("Invalid annotated block geometry.");
  if (!Array.isArray(set.objects) || set.objects.length > 10000)
    throw new Error("Too many annotations.");
  let count = 0;
  for (const a of set.objects) {
    if (
      !a ||
      typeof a.id !== "string" ||
      ![
        "pen",
        "marker",
        "highlighter",
        "underline",
        "line",
        "arrow",
        "rectangle",
        "ellipse",
      ].includes(a.tool) ||
      !/^#[0-9a-f]{6}$/i.test(a.color) ||
      !finite(a.width) ||
      a.width <= 0 ||
      a.width > 100 ||
      !finite(a.opacity) ||
      a.opacity < 0 ||
      a.opacity > 1 ||
      !Array.isArray(a.points) ||
      !a.points.length
    )
      throw new Error("Invalid annotation style.");
    count += a.points.length;
    if (
      count > 200000 ||
      a.points.some(
        (p) =>
          !finite(p.x) ||
          !finite(p.y) ||
          Math.abs(p.x) > 2000000 ||
          Math.abs(p.y) > 2000000 ||
          (p.pressure !== undefined &&
            (!finite(p.pressure) || p.pressure < 0 || p.pressure > 1)),
      )
    )
      throw new Error("Invalid annotation geometry or point limit exceeded.");
  }
}
