import { useEffect, useRef } from "react";
import { Hand, Pencil } from "lucide-react";
import { ZOOM_LIMITS } from "./usePreviewNavigation";
export function PreviewControls({
  zoom,
  change,
  fit,
  hand,
  toggleHand,
  drawing,
  toggleDrawing,
  busy,
}: {
  zoom: number;
  change: (n: number, reset?: boolean) => void;
  fit: () => void;
  hand: boolean;
  toggleHand: () => void;
  drawing: boolean;
  toggleDrawing: () => void;
  busy: boolean;
}) {
  const slider = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = slider.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      change(zoom + (e.deltaY < 0 ? 5 : -5));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, change]);
  return (
    <div
      className="preview-controls"
      role="group"
      aria-label="Preview navigation"
    >
      <button
        aria-pressed={hand}
        aria-label="Pan page"
        onClick={toggleHand}
        title="Pan page (hold Space to pan temporarily)"
      >
        <Hand size={17} />
      </button>
      <button aria-label="Annotate" title="Annotate" aria-pressed={drawing} onClick={toggleDrawing} disabled={busy}>
        <Pencil size={17} />
      </button>
      <input
        ref={slider}
        type="range"
        aria-label="Preview zoom"
        min={ZOOM_LIMITS.min}
        max={ZOOM_LIMITS.max}
        step="1"
        value={Math.round(zoom)}
        onChange={(e) => change(Number(e.target.value))}
      />
      <span className="zoom-percentage" aria-label="Zoom percentage">
        {Math.round(zoom)}%
      </span>
      <button
        aria-label="Reset preview zoom"
        onClick={() => change(100, true)}
        title="Reset zoom and page position"
      >
        100%
      </button>
      <button onClick={fit}>Fit width</button>
    </div>
  );
}
