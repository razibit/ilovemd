import { useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceDocument } from "./storage";

/** Fixed row virtualization keeps even large workspaces inexpensive to mount. */
export function WorkspaceList({
  documents,
  active,
  select,
}: {
  documents: WorkspaceDocument[];
  active: string;
  select: (id: string) => void;
}) {
  const [top, setTop] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const index = documents.findIndex((d) => d.id === active);
    const row = Math.max(0, index) * 40;
    if (row < node.scrollTop) node.scrollTop = row;
    else if (row + 40 > node.scrollTop + node.clientHeight)
      node.scrollTop = row + 40 - node.clientHeight;
    setTop(node.scrollTop);
  }, [active, documents.length]);
  const start = Math.max(0, Math.floor(top / 40) - 4),
    end = Math.min(documents.length, start + 16);
  return (
    <div
      ref={scroll}
      className="workspace-documents"
      role="navigation"
      aria-label="Workspace documents"
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: documents.length * 40, position: "relative" }}>
        {documents.slice(start, end).map((d, i) => (
          <button
            key={d.id}
            className={`document-item ${d.id === active ? "active" : ""}`}
            aria-current={d.id === active ? "page" : undefined}
            style={{
              position: "absolute",
              top: (start + i) * 40,
              height: 40,
              width: "100%",
            }}
            onClick={() => select(d.id)}
            onKeyDown={(event) => {
              const index = start + i;
              const target =
                event.key === "ArrowDown"
                  ? index + 1
                  : event.key === "ArrowUp"
                    ? index - 1
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? documents.length - 1
                        : undefined;
              if (target === undefined || !documents[target]) return;
              event.preventDefault();
              select(documents[target].id);
            }}
          >
            <span>{d.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
