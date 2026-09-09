import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
export function useToolbarVisibility(
  root: RefObject<HTMLElement | null>,
  suppress: RefObject<number>,
  ready: boolean,
) {
  const [hidden, setHidden] = useState(false);
  const owner = useRef<Element | null>(null),
    last = useRef(0),
    lastHeight = useRef(0),
    travel = useRef(0),
    intentAt = useRef(0);
  useLayoutEffect(() => {
    const el = root.current;
    const slot = el?.querySelector<HTMLElement>(".toolbar-slot");
    const toolbar = el?.querySelector<HTMLElement>(".workspace-toolbar");
    if (!el || !slot || !toolbar) return;
    const resize = () => {
      const height = hidden ? 0 : toolbar.getBoundingClientRect().height;
      if (slot.style.height === `${height}px`) return;
      const positions = [...el.querySelectorAll<HTMLElement>(".preview-scroll,.cm-scroller")]
        .map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }));
      suppress.current = performance.now() + 80;
      slot.style.height = `${height}px`;
      for (const { node, top, left } of positions) {
        node.scrollTop = top;
        node.scrollLeft = left;
      }
      if (owner.current) last.current = owner.current.scrollTop;
      travel.current = 0;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [hidden, ready]);
  useEffect(() => {
    const el = root.current;
    if (!el || !ready) return;
    const intent = (e: Event) => {
      if (
        e instanceof KeyboardEvent &&
        (e.ctrlKey ||
          e.metaKey ||
          ![
            "PageDown",
            "PageUp",
            "ArrowDown",
            "ArrowUp",
            "Home",
            "End",
            " ",
          ].includes(e.key))
      )
        return;
      const target = (e.target as Element).closest(
        ".preview-scroll,.cm-scroller",
      );
      if (target && owner.current !== target) {
        owner.current = target;
        last.current = target.scrollTop;
        lastHeight.current = target.scrollHeight;
        travel.current = 0;
      }
      // Establish the scroll owner before the browser applies a wheel scroll.
      // Hover alone must not count as scrolling intent.
      if (e instanceof PointerEvent && e.type === "pointermove" && !e.buttons) return;
      if (target) intentAt.current = performance.now();
    };
    const scroll = (e: Event) => {
      const target = e.target as Element;
      if (
        target.matches?.(".preview-scroll,.cm-scroller") &&
        performance.now() >= suppress.current &&
        target.scrollTop <= 2
      ) {
        setHidden(false);
        travel.current = 0;
      }
      if (target !== owner.current) return;
      const y = target.scrollTop,
        delta = y - last.current;
      last.current = y;
      const previousHeight = lastHeight.current;
      lastHeight.current = target.scrollHeight;
      // CodeMirror can shrink its measured content at the bottom. That clamp
      // is not an upward navigation gesture and must not reopen the toolbar.
      if (delta < 0 && target.scrollHeight < previousHeight &&
          y >= target.scrollHeight - target.clientHeight - 2) {
        travel.current = 0;
        return;
      }
      if (
        performance.now() < suppress.current ||
        performance.now() - intentAt.current > 500
      ) {
        travel.current = 0;
        return;
      }
      const toolbar = el.querySelector(".workspace-toolbar");
      if (
        y <= 2 ||
        toolbar?.contains(document.activeElement) ||
        toolbar?.matches(":hover") ||
        toolbar?.querySelector("details[open]")
      ) {
        setHidden(false);
        travel.current = 0;
        return;
      }
      if (Math.sign(delta) !== Math.sign(travel.current)) travel.current = 0;
      travel.current += delta;
      if (travel.current >= 24) setHidden(true);
      else if (travel.current <= -12) setHidden(false);
    };
    const outside = (e: PointerEvent) => {
      const menu = el.querySelector<HTMLDetailsElement>(
        ".workspace-more[open]",
      );
      if (menu && !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", outside);
    const focus = (e: FocusEvent) => {
      if ((e.target as Element).closest(".workspace-toolbar")) setHidden(false);
    };
    for (const name of [
      "wheel",
      "pointerdown",
      "pointermove",
      "touchstart",
      "keydown",
    ])
      el.addEventListener(name, intent, { capture: true, passive: true });
    el.addEventListener("scroll", scroll, true);
    el.addEventListener("focusin", focus);
    return () => {
      for (const name of [
        "wheel",
        "pointerdown",
        "pointermove",
        "touchstart",
        "keydown",
      ])
        el.removeEventListener(name, intent, true);
      el.removeEventListener("scroll", scroll, true);
      el.removeEventListener("focusin", focus);
      document.removeEventListener("pointerdown", outside);
    };
  }, [ready]);
  return hidden;
}
