import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const ZOOM_LIMITS = { min: 25, max: 400 };
export function anchoredScroll(
  scroll: number,
  focal: number,
  oldZoom: number,
  nextZoom: number,
  offset = 0,
) {
  return ((scroll + focal - offset) * nextZoom) / oldZoom + offset - focal;
}
export function usePreviewNavigation(
  preview: RefObject<HTMLDivElement | null>,
  surface: RefObject<HTMLDivElement | null>,
  zoom: number,
  setZoom: (n: number) => void,
  suppress: RefObject<number>,
  ready: boolean,
) {
  const [hand, setHand] = useState(false),
    [space, setSpace] = useState(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    id: number;
  } | null>(null);
  const pan = hand || space;
  const [requestVersion, setRequestVersion] = useState(0);
  const anchor = useRef<{
    point: { x: number; y: number };
    focal: { x: number; y: number };
    reset: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const p = preview.current,
      s = surface.current,
      pending = anchor.current;
    if (!p || !s || !pending) return;
    const r = s.getBoundingClientRect();
    p.scrollLeft += r.left + (pending.point.x * zoom) / 100 - pending.focal.x;
    p.scrollTop += r.top + (pending.point.y * zoom) / 100 - pending.focal.y;
    if (pending.reset) {
      p.scrollLeft = (p.scrollWidth - p.clientWidth) / 2;
      p.scrollTop = 0;
    }
    anchor.current = null;
  }, [zoom, requestVersion]);
  const applyZoom = (
    next: number,
    focal?: { x: number; y: number },
    reset = false,
  ) => {
    const p = preview.current,
      s = surface.current;
    if (!p || !s) return;
    next = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, next));
    const r = p.getBoundingClientRect(),
      sr = s.getBoundingClientRect();
    const f = focal ?? {
      x: r.left + p.clientWidth / 2,
      y: r.top + p.clientHeight / 2,
    };
    const point = {
      x: (f.x - sr.left) / (sr.width / s.offsetWidth),
      y: (f.y - sr.top) / (sr.width / s.offsetWidth),
    };
    suppress.current = performance.now() + 250;
    anchor.current = { point, focal: f, reset };
    zoomRef.current = next;
    setZoom(next);
    setRequestVersion((v) => v + 1);
  };
  const latest = useRef(applyZoom);
  latest.current = applyZoom;
  useEffect(() => {
    const p = preview.current;
    if (!p) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      latest.current(zoomRef.current * Math.exp(-e.deltaY * 0.01), {
        x: e.clientX,
        y: e.clientY,
      });
    };
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as Element)?.closest(
          'input,textarea,select,[contenteditable="true"],.cm-editor',
        )
      )
        return;
      if (
        e.code === "Space" &&
        (p.matches(":hover") || p.contains(document.activeElement))
      ) {
        e.preventDefault();
        setSpace(e.type === "keydown");
      }
    };
    const release = () => {
      setSpace(false);
      drag.current = null;
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    p.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    return () => {
      p.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
    };
  }, [preview, ready]);
  return {
    pan,
    hand,
    setHand,
    applyZoom,
    fit: () => {
      const p = preview.current,
        s = surface.current;
      if (p && s)
        applyZoom(
          ((p.clientWidth - 32) / s.offsetWidth) * 100,
          undefined,
          true,
        );
    },
    panProps: {
      onPointerDownCapture: (e: React.PointerEvent) => {
        if (!pan || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const p = preview.current!;
        p.setPointerCapture(e.pointerId);
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          left: p.scrollLeft,
          top: p.scrollTop,
          id: e.pointerId,
        };
      },
      onPointerMoveCapture: (e: React.PointerEvent) => {
        const d = drag.current,
          p = preview.current;
        if (!d || !p) return;
        e.preventDefault();
        e.stopPropagation();
        p.scrollLeft = d.left - e.clientX + d.x;
        p.scrollTop = d.top - e.clientY + d.y;
      },
      onPointerUpCapture: (e: React.PointerEvent) => {
        if (!drag.current) return;
        e.stopPropagation();
        drag.current = null;
        preview.current?.releasePointerCapture(e.pointerId);
      },
      onPointerCancel: () => {
        drag.current = null;
        setSpace(false);
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (pan) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}
