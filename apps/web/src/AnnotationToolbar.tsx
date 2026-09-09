import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MousePointer2, PenTool, Paintbrush, Highlighter, Underline, Minus, MoveUpRight, Square, Circle, Eraser, GripHorizontal, X, Palette, Settings2, Undo2, Redo2, Trash2, ListX } from "lucide-react";
import type { DrawingTool } from "../../../packages/engine/src/annotations";
export type Tool = DrawingTool | "select" | "eraser";
export interface ToolSettings {
  tool: Tool;
  color: string;
  width: number;
  opacity: number;
  smoothing: number;
  snap: boolean;
}
export const defaultToolSettings: ToolSettings = {
  tool: "pen",
  color: "#b42332",
  width: 3,
  opacity: 1,
  smoothing: 0.35,
  snap: false,
};
export function AnnotationToolbar({
  settings: s,
  pan,
  chooseTool,
  visible,
  close,
  change,
  undo,
  redo,
  canUndo,
  canRedo,
  clear,
  remove,
  selected,
}: {
  settings: ToolSettings;
  pan: boolean;
  chooseTool: () => void;
  visible: boolean;
  close: () => void;
  change: (s: ToolSettings) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
  remove: () => void;
  selected: boolean;
}) {
  const palette = useRef<HTMLDivElement>(null);
  const position = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const place = (x: number, y: number) => {
    const el = palette.current;
    if (!el) return;
    const previewBounds = document.querySelector(".preview-scroll")?.getBoundingClientRect();
    const minY = Math.max(8, previewBounds?.top ?? 8);
    const maxY = Math.max(minY, (previewBounds?.bottom ?? innerHeight) - el.offsetHeight - 8);
    const next = {
      x: Math.max(8, Math.min(x, innerWidth - el.offsetWidth - 8)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
    position.current = next;
    el.style.left = `${next.x}px`;
    el.style.top = `${next.y}px`;
  };
  useLayoutEffect(() => {
    if (!visible) return;
    const reposition = () => {
      const bounds = document.querySelector(".preview-scroll")?.getBoundingClientRect();
      place(position.current?.x ?? (bounds?.right ?? innerWidth) - 368,
        position.current?.y ?? (bounds?.top ?? 80) + 12);
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(palette.current!);
    window.addEventListener("resize", reposition);
    return () => { observer.disconnect(); window.removeEventListener("resize", reposition); };
  }, [visible]);
  const tools = [
    ["select", "Select", MousePointer2], ["pen", "Pen", PenTool],
    ["marker", "Marker", Paintbrush], ["highlighter", "Highlighter", Highlighter],
    ["underline", "Underline", Underline], ["line", "Line", Minus],
    ["arrow", "Arrow", MoveUpRight], ["rectangle", "Rectangle", Square],
    ["ellipse", "Ellipse", Circle], ["eraser", "Eraser", Eraser],
  ] as const;
  return createPortal(<div ref={palette} hidden={!visible} className="annotation-toolbar" role="group" aria-label="Drawing tools">
    <div className="palette-heading">
      <button className="palette-grip" aria-label="Move annotation palette" title="Drag to move; arrow keys move, Shift for larger steps"
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.stopPropagation(); e.currentTarget.focus();
          const r = palette.current!.getBoundingClientRect();
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          e.preventDefault(); e.stopPropagation();
          place(d.left + e.clientX - d.x, d.top + e.clientY - d.y);
        }}
        onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={e => {
          if (!e.key.startsWith("Arrow")) return;
          e.preventDefault(); e.stopPropagation();
          const r = palette.current!.getBoundingClientRect(), step = e.shiftKey ? 20 : 5;
          place(r.left + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0),
            r.top + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0));
        }}><GripHorizontal size={16} /><span>{pan ? "Annotations · Pan" : "Annotations"}</span></button>
      <button aria-label="Close annotation palette" title="Close annotation palette" onClick={close}><X size={16} /></button>
    </div>
    <div className="palette-tools" role="group" aria-label="Annotation tools">
      {tools.map(([tool, label, Icon]) => <button key={tool} aria-label={label} title={label} aria-pressed={!pan && s.tool === tool}
        onClick={() => { chooseTool(); change({ ...s, tool, width: tool === "highlighter" ? 18 : tool === "marker" ? 8 : 3, opacity: tool === "highlighter" ? .25 : 1 }); }}><Icon size={17} /></button>)}
    </div>
    <div className="palette-colors" role="group" aria-label="Stroke colors">
      {[["#b42332", "Red"], ["#d97706", "Amber"], ["#eab308", "Yellow"], ["#15803d", "Green"], ["#2563eb", "Blue"], ["#7c3aed", "Violet"], ["#202124", "Black"]].map(([color, name]) =>
        <button key={color} className="color-swatch" style={{ "--swatch": color } as CSSProperties} aria-label={`${name} stroke`} title={name} aria-pressed={s.color.toLowerCase() === color} onClick={() => change({ ...s, color })} />)}
      <label className="custom-color" title="Custom stroke color"><Palette size={16} /><input aria-label="Stroke color" type="color" value={s.color} onChange={e => change({ ...s, color: e.target.value })} /></label>
      <span role="img" className="current-color" style={{ background: s.color }} title={`Selected color: ${s.color}`} aria-label={`Selected color: ${s.color}`} />
    </div>
    <div className="palette-settings">
      <div className="width-presets" role="group" aria-label="Stroke width presets">{[1, 3, 8, 18].map(width =>
        <button key={width} aria-label={`Stroke width ${width}`} title={`${width} px`} aria-pressed={s.width === width} onClick={() => change({ ...s, width })}><span style={{ height: Math.min(width, 10) }} /></button>)}</div>
      <details className="palette-details"><summary aria-label="Stroke settings" title="Stroke settings"><Settings2 size={16} /></summary>
        <div className="drawing-assistance">
          <label>Width <input aria-label="Stroke width" type="number" min="1" max="40" value={s.width} onChange={e => change({ ...s, width: Math.max(1, Math.min(40, +e.target.value)) })} /></label>
          <label>Opacity <input aria-label="Stroke opacity" type="range" min=".05" max={s.tool === "highlighter" ? ".45" : "1"} step=".05" value={s.opacity} onChange={e => change({ ...s, opacity: +e.target.value })} /><output>{Math.round(s.opacity * 100)}%</output></label>
          <label>Smoothing <input aria-label="Stroke smoothing" type="range" min="0" max=".85" step=".05" value={s.smoothing} onChange={e => change({ ...s, smoothing: +e.target.value })} /><output>{Math.round(s.smoothing * 100)}%</output></label>
          <label><input type="checkbox" checked={s.snap} onChange={e => change({ ...s, snap: e.target.checked })} /> Snap endpoints and angles</label>
          <p>Hold Shift for straight strokes, 45° lines, squares or circles.</p>
        </div>
      </details>
      <span className="palette-separator" />
      <button onClick={undo} disabled={!canUndo} aria-label="Undo note" title="Undo note"><Undo2 size={16} /></button>
      <button onClick={redo} disabled={!canRedo} aria-label="Redo note" title="Redo note"><Redo2 size={16} /></button>
      <button onClick={remove} disabled={!selected} aria-label="Delete selected" title="Delete selected"><Trash2 size={16} /></button>
      <button onClick={clear} aria-label="Clear notes" title="Clear notes"><ListX size={16} /></button>
    </div>
  </div>, document.body);
}
