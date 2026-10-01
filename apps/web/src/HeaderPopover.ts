import { useLayoutEffect, useRef, useState } from "react";

/** Header popovers share positioning, dismissal and focus restoration. */
export function useHeaderPopover() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const show = (last = false) => {
    focusLast.current = last;
    setOpen(true);
  };
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const position = () => {
      const button = trigger.current!,
        popover = panel.current!;
      const r = button.getBoundingClientRect();
      popover.style.left = `${Math.max(8, Math.min(r.left, innerWidth - popover.offsetWidth - 8))}px`;
      const below = r.bottom + 6;
      popover.style.top = `${Math.max(8, below + popover.offsetHeight <= innerHeight - 8 ? below : r.top - popover.offsetHeight - 6)}px`;
    };
    position();
    const focusable =
      panel.current.querySelectorAll<HTMLElement>("input, button");
    focusable[focusLast.current ? focusable.length - 1 : 0]?.focus();
    const outside = (e: Event) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      } else if (e.key === "Tab" && panel.current?.contains(e.target as Node)) {
        // Resume the header's natural tab order instead of tabbing from a portal
        // at the end of the document. Leave default Tab handling intact.
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const observer = new ResizeObserver(position);
    observer.observe(panel.current);
    observer.observe(trigger.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", keys);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);
  return { open, show, close, trigger, panel };
}
