import { useLayoutEffect, useRef, useState } from "react";
import { Check, FileText } from "lucide-react";
import type { WorkspaceDocument } from "./storage";

export const DOCUMENT_ROW_HEIGHT = 44;

/** Only visible rows are mounted, in both the sidebar and the document picker. */
export function DocumentRows({
  documents,
  active,
  highlight = active,
  select,
  id,
  picker = false,
}: {
  documents: WorkspaceDocument[];
  active: string;
  highlight?: string;
  select: (id: string) => void;
  id?: string;
  picker?: boolean;
}) {
  const [viewport, setViewport] = useState({ top: 0, height: 264 });
  const [visibleRows, setVisibleRows] = useState(6);
  const scroll = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [keyboardTarget, setKeyboardTarget] = useState<string | null>(null);
  const target = keyboardTarget ?? highlight;
  useLayoutEffect(() => {
    setKeyboardTarget(null);
  }, [highlight]);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const update = () => {
      // Reserve a proportion of the sidebar, but stop at whole rows so the
      // resting viewport never presents a sliced-off document title.
      const available = picker
        ? innerHeight / 2
        : (node.parentElement?.clientHeight ?? innerHeight) / 4;
      setVisibleRows(
        Math.max(1, Math.min(6, Math.floor(available / DOCUMENT_ROW_HEIGHT))),
      );
      setViewport({ top: node.scrollTop, height: node.clientHeight });
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [picker]);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const index = documents.findIndex((d) => d.id === target);
    const row = Math.max(0, index) * DOCUMENT_ROW_HEIGHT;
    if (row < node.scrollTop) node.scrollTop = row;
    else if (row + DOCUMENT_ROW_HEIGHT > node.scrollTop + node.clientHeight)
      node.scrollTop = row + DOCUMENT_ROW_HEIGHT - node.clientHeight;
    setViewport({ top: node.scrollTop, height: node.clientHeight });
  }, [target, documents, viewport.height]);
  const start = Math.max(0, Math.floor(viewport.top / DOCUMENT_ROW_HEIGHT) - 3);
  const end = Math.min(
    documents.length,
    start + Math.ceil(viewport.height / DOCUMENT_ROW_HEIGHT) + 7,
  );
  // Keep the keyboard target in the accessibility tree when a user scrolls
  // elsewhere. aria-activedescendant must always reference a mounted option.
  const targetIndex = documents.findIndex((d) => d.id === target);
  const indices = Array.from(
    { length: Math.max(0, end - start) },
    (_, i) => start + i,
  );
  if (targetIndex >= 0 && !indices.includes(targetIndex))
    indices.push(targetIndex);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const button = Array.from(
      scroll.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((b) => b.dataset.documentId === pendingFocus.current);
    if (button) {
      button.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [start, end, keyboardTarget]);
  return (
    <div
      ref={scroll}
      id={id}
      className={`workspace-documents${picker ? " document-picker-list" : ""}${documents.length ? "" : " is-empty"}`}
      role={picker ? "listbox" : "navigation"}
      aria-label={picker ? "Documents" : "Workspace documents"}
      style={{
        height: Math.min(documents.length, visibleRows) * DOCUMENT_ROW_HEIGHT,
      }}
      onScroll={(e) =>
        setViewport({
          top: e.currentTarget.scrollTop,
          height: e.currentTarget.clientHeight,
        })
      }
    >
      <div
        style={{
          height: documents.length * DOCUMENT_ROW_HEIGHT,
          position: "relative",
        }}
      >
        {indices.map((index) => {
          const d = documents[index];
          return (
            <button
              key={d.id}
              id={id ? `${id}-${d.id}` : undefined}
              data-document-id={d.id}
              role={picker ? "option" : undefined}
              aria-selected={picker ? d.id === active : undefined}
              aria-setsize={picker ? documents.length : undefined}
              aria-posinset={picker ? index + 1 : undefined}
              aria-current={!picker && d.id === active ? "page" : undefined}
              tabIndex={picker ? -1 : d.id === active ? 0 : -1}
              title={d.title}
              className={`document-item${d.id === active ? " active" : ""}${picker && d.id === highlight ? " keyboard-highlight" : ""}`}
              style={{
                position: "absolute",
                top: index * DOCUMENT_ROW_HEIGHT,
                height: DOCUMENT_ROW_HEIGHT,
                width: "100%",
              }}
              onMouseDown={picker ? (e) => e.preventDefault() : undefined}
              onClick={() => select(d.id)}
              onKeyDown={
                picker
                  ? undefined
                  : (event) => {
                      const next =
                        event.key === "ArrowDown"
                          ? index + 1
                          : event.key === "ArrowUp"
                            ? index - 1
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? documents.length - 1
                                : undefined;
                      if (next === undefined || !documents[next]) return;
                      event.preventDefault();
                      pendingFocus.current = documents[next].id;
                      setKeyboardTarget(documents[next].id);
                      select(documents[next].id);
                    }
              }
            >
              <FileText size={16} aria-hidden="true" />
              <span className="document-item-title">{d.title}</span>
              {d.id === active && (
                <Check
                  size={14}
                  className="document-item-check"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceList(props: {
  documents: WorkspaceDocument[];
  active: string;
  select: (id: string) => void;
}) {
  return <DocumentRows {...props} />;
}
