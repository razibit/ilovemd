import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export function ZoomPopover({ zoom, children }: { zoom: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const button = trigger.current!, popover = panel.current!;
      const r = button.getBoundingClientRect();
      popover.style.left = `${Math.max(8, Math.min(r.right - popover.offsetWidth, innerWidth - popover.offsetWidth - 8))}px`;
      popover.style.top = `${Math.max(8, r.top - popover.offsetHeight - 8)}px`;
    };
    position();
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    const observer = new ResizeObserver(position);
    observer.observe(panel.current!);
    window.addEventListener("resize", position);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <>
    <button ref={trigger} className="zoom-button" aria-label={`Preview zoom: ${Math.round(zoom)}%`}
      aria-expanded={open} aria-controls={open ? "preview-navigation-popover" : undefined}
      aria-haspopup="dialog" onClick={() => setOpen(!open)}>
      {Math.round(zoom)}% <ChevronDown size={12} />
    </button>
    {open && createPortal(<div ref={panel} id="preview-navigation-popover" className="zoom-popover"
      role="dialog" aria-label="Preview controls" onBlur={e => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== trigger.current) setOpen(false);
      }}>{children}</div>, document.body)}
  </>;
}
