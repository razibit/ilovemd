import { useRef, useState, useEffect, memo } from "react";
import {
  annotationSvg,
  bounds,
  moveAnnotation,
  type Annotation,
  type AnnotationSet,
  type Point,
} from "../../../packages/engine/src/annotations";
import type { ToolSettings } from "./AnnotationToolbar";

const NoteShape = memo(function NoteShape({
  annotation,
}: {
  annotation: Annotation;
}) {
  return (
    <g
      data-note-id={annotation.id}
      dangerouslySetInnerHTML={{ __html: annotationSvg(annotation) }}
    />
  );
});

export function AnnotationLayer({
  set,
  enabled,
  settings,
  change,
  undo,
  redo,
  selected,
  select,
}: {
  selected: string | null;
  select: (id: string | null) => void;
  set: AnnotationSet;
  enabled: boolean;
  settings: ToolSettings;
  change: (objects: Annotation[]) => void;
  undo: () => void;
  redo: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const gesture = useRef<{
    id: number;
    pointerType: string;
    start: Point;
    original?: Annotation;
    drawing?: Annotation;
    resize?: boolean;
    objects: Annotation[];
  } | null>(null);
  const frame = useRef(0),
    pending = useRef<Annotation | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (!enabled) {
      const id = gesture.current?.id;
      if (id !== undefined && svgRef.current?.hasPointerCapture(id)) svgRef.current.releasePointerCapture(id);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = null;
      gesture.current = null;
      setDraft(null);
    }
  }, [enabled]);
  useEffect(() => {
    const id = gesture.current?.id;
    if (id !== undefined && svgRef.current?.hasPointerCapture(id)) svgRef.current.releasePointerCapture(id);
    cancelAnimationFrame(frame.current); frame.current = 0;
    pending.current = null; gesture.current = null; setDraft(null);
  }, [settings.tool]);
  const point = (
    e: {
      clientX: number;
      clientY: number;
      pressure?: number;
      pointerType?: string;
    },
    svg: SVGSVGElement,
  ): Point => {
    const r = svg.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          set.layout.width,
          ((e.clientX - r.left) * set.layout.width) / r.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          set.layout.height,
          ((e.clientY - r.top) * set.layout.height) / r.height,
        ),
      ),
      pressure: e.pointerType === "pen" ? e.pressure : undefined,
    };
  };
  const renderDraft = (a: Annotation) => {
    pending.current = a;
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setDraft(pending.current);
      });
  };
  const chosen = set.objects.find((a) => a.id === selected),
    shown = draft?.id === selected ? draft : chosen;
  const boundedMove = (a: Annotation, dx: number, dy: number) => {
    const b = bounds(a);
    return moveAnnotation(
      a,
      Math.max(-b.x, Math.min(set.layout.width - b.x - b.width, dx)),
      Math.max(-b.y, Math.min(set.layout.height - b.y - b.height, dy)),
    );
  };
  const remove = () => {
    if (selected) {
      change(set.objects.filter((a) => a.id !== selected));
      select(null);
    }
  };
  return (
    <svg
      ref={svgRef}
      className={`annotation-layer ${enabled ? "drawing-enabled" : ""}`}
      aria-label="Document annotations"
      role="group"
      tabIndex={enabled ? 0 : -1}
      viewBox={`0 0 ${set.layout.width} ${set.layout.height}`}
      width={set.layout.width}
      height={set.layout.height}
      onKeyDown={(e) => {
        if (!enabled) return;
        if (
          (e.ctrlKey || e.metaKey) &&
          ["z", "y"].includes(e.key.toLowerCase())
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key.toLowerCase() === "y" || e.shiftKey) redo();
          else undo();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          remove();
        } else if (e.key === "Escape") {
          select(null);
          cancelAnimationFrame(frame.current);
          frame.current = 0;
          pending.current = null;
          gesture.current = null;
          setDraft(null);
        } else if (chosen && e.key.startsWith("Arrow")) {
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          change(
            set.objects.map((a) =>
              a.id === selected
                ? boundedMove(
                    a,
                    e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0,
                    e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0,
                  )
                : a,
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        if (gesture.current && gesture.current.id !== e.pointerId && gesture.current.pointerType === "touch" && e.pointerType === "touch") {
          cancelAnimationFrame(frame.current); frame.current = 0;
          pending.current = null; gesture.current = null; setDraft(null);
          return;
        }
        if (!enabled || e.button !== 0 || gesture.current || (e.pointerType === "touch" && !e.isPrimary)) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = point(e, e.currentTarget),
          id = (e.target as Element)
            .closest("[data-note-id]")
            ?.getAttribute("data-note-id"),
          original = set.objects.find((a) => a.id === id);
        if (settings.tool === "eraser") {
          if (id) change(set.objects.filter((a) => a.id !== id));
          return;
        }
        if (settings.tool === "select") {
          select(id ?? null);
          if (original)
            gesture.current = {
              id: e.pointerId,
              pointerType: e.pointerType,
              start: p,
              original,
              resize: (e.target as Element).hasAttribute("data-resize"),
              objects: set.objects,
            };
          return;
        }
        select(null);
        const drawing: Annotation = {
          id: crypto.randomUUID(),
          tool: settings.tool,
          points: [p, p],
          color: settings.color,
          width: settings.width,
          opacity:
            settings.tool === "highlighter"
              ? Math.min(0.45, settings.opacity)
              : settings.opacity,
        };
        gesture.current = { id: e.pointerId, pointerType: e.pointerType, start: p, drawing, objects: set.objects };
        setDraft(drawing);
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        let p = point(e, e.currentTarget);
        if (g.original) {
          const b = bounds(g.original);
          const dx = Math.max(
              -b.x,
              Math.min(set.layout.width - b.x - b.width, p.x - g.start.x),
            ),
            dy = Math.max(
              -b.y,
              Math.min(set.layout.height - b.y - b.height, p.y - g.start.y),
            );
          const next = g.resize
            ? {
                ...g.original,
                points: g.original.points.map((q) => ({
                  ...q,
                  x:
                    b.x +
                    ((q.x - b.x) * Math.max(1, b.width + dx)) /
                      Math.max(1, b.width),
                  y:
                    b.y +
                    ((q.y - b.y) * Math.max(1, b.height + dy)) /
                      Math.max(1, b.height),
                })),
              }
            : moveAnnotation(g.original, dx, dy);
          pending.current = next;
          renderDraft(next);
          return;
        }
        const a = g.drawing!;
        if (settings.snap) {
          const endpoints = set.objects.flatMap((o) => [
            o.points[0],
            o.points.at(-1)!,
          ]);
          const close = endpoints.find(
            (q) => Math.hypot(q.x - p.x, q.y - p.y) < 8,
          );
          if (close) p = close;
        }
        const free = ["pen", "marker", "highlighter"].includes(a.tool);
        if (a.tool === "underline") p = { ...p, y: g.start.y };
        else if (e.shiftKey || (settings.snap && !free)) {
          let dx = p.x - g.start.x,
            dy = p.y - g.start.y;
          if (["rectangle", "ellipse"].includes(a.tool)) {
            const n = Math.max(Math.abs(dx), Math.abs(dy));
            dx = Math.sign(dx) * n;
            dy = Math.sign(dy) * n;
          } else {
            const angle =
                (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
              length = Math.hypot(dx, dy);
            dx = Math.cos(angle) * length;
            dy = Math.sin(angle) * length;
          }
          p = { x: g.start.x + dx, y: g.start.y + dy };
        }
        p = {
          ...p,
          x: Math.max(0, Math.min(set.layout.width, p.x)),
          y: Math.max(0, Math.min(set.layout.height, p.y)),
        };
        if (free && !e.shiftKey) {
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
          for (const sample of events.length ? events : [e.nativeEvent]) {
            const q = point(sample, e.currentTarget),
              last = a.points.at(-1)!;
            if (Math.hypot(q.x - last.x, q.y - last.y) > 0.3)
              a.points.push({
                x: q.x * (1 - settings.smoothing) + last.x * settings.smoothing,
                y: q.y * (1 - settings.smoothing) + last.y * settings.smoothing,
                pressure: q.pressure,
              });
          }
        } else a.points = [g.start, p];
        pending.current = { ...a, points: [...a.points] };
        renderDraft(pending.current);
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        const a = pending.current ?? g.drawing;
        if (a)
          change(
            g.original
              ? g.objects.map((o) => (o.id === a.id ? a : o))
              : [...g.objects, a],
          );
        gesture.current = null;
        pending.current = null;
        setDraft(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={() => {
        cancelAnimationFrame(frame.current); frame.current = 0;
        gesture.current = null; pending.current = null; setDraft(null);
      }}
      onPointerCancel={() => {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        gesture.current = null;
        pending.current = null;
        setDraft(null);
      }}
    >
      {set.objects
        .filter((a) => a.id !== draft?.id)
        .map((a) => (
          <NoteShape key={a.id} annotation={a} />
        ))}
      {draft && (
        <g
          data-note-id={draft.id}
          dangerouslySetInnerHTML={{ __html: annotationSvg(draft) }}
        />
      )}
      {enabled &&
        shown &&
        settings.tool === "select" &&
        (() => {
          const b = bounds(shown);
          return (
            <g data-note-id={shown.id}>
              <rect
                x={b.x - 4}
                y={b.y - 4}
                width={b.width + 8}
                height={b.height + 8}
                fill="none"
                stroke="#2776d2"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              <rect
                data-resize="true"
                x={b.x + b.width - 6}
                y={b.y + b.height - 6}
                width="12"
                height="12"
                fill="#2776d2"
              />
            </g>
          );
        })()}
    </svg>
  );
}
