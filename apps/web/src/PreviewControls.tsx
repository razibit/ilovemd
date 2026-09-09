import { useEffect, useRef } from "react";

import { ZOOM_LIMITS } from "./usePreviewNavigation";
export function PreviewControls({
  zoom,
  change,
  fit,
}: {
  zoom: number;
  change: (n: number, reset?: boolean) => void;
  fit: () => void;
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
