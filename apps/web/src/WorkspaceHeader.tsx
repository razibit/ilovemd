import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  FileText,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import type { WorkspaceDocument } from "./storage";
import { DocumentRows } from "./WorkspaceList";
import { useHeaderPopover } from "./HeaderPopover";

function DocumentSelector({
  documents,
  active,
  select,
}: {
  documents: WorkspaceDocument[];
  active: string;
  select: (id: string) => void;
}) {
  const popover = useHeaderPopover();
  const id = useId();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(active);
  const filtered = useMemo(
    () =>
      documents.filter((d) =>
        d.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [documents, query],
  );
  const index = Math.max(
    0,
    filtered.findIndex((d) => d.id === cursor),
  );
  const highlighted = filtered[index]?.id;
  const title =
    documents.find((d) => d.id === active)?.title ?? "Untitled document";
  const choose = (documentId: string) => {
    popover.close();
    select(documentId);
  };
  const show = () => {
    setQuery("");
    setCursor(active);
    popover.show();
  };
  return (
    <>
      <button
        ref={popover.trigger}
        className="document-selector"
        aria-label="Active document"
        aria-describedby={`${id}-title`}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        aria-controls={popover.open ? `${id}-panel` : undefined}
        onClick={() => (popover.open ? popover.close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <FileText size={15} aria-hidden="true" />
        <span id={`${id}-title`}>{title}</span>
        <ChevronDown
          size={14}
          className="document-selector-chevron"
          aria-hidden="true"
        />
      </button>
      {popover.open &&
        createPortal(
          <div
            ref={popover.panel}
            id={`${id}-panel`}
            className="header-popover document-picker"
            role="dialog"
            aria-label="Switch document"
          >
            <div className="document-picker-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="Search documents"
                placeholder="Search documents…"
                value={query}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={
                  highlighted ? `${id}-list-${highlighted}` : undefined
                }
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor("");
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.ctrlKey || e.metaKey)
                    return;
                  const next =
                    e.key === "ArrowDown"
                      ? Math.min(index + 1, filtered.length - 1)
                      : e.key === "ArrowUp"
                        ? Math.max(0, index - 1)
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? filtered.length - 1
                            : undefined;
                  if (next !== undefined && filtered[next]) {
                    e.preventDefault();
                    setCursor(filtered[next].id);
                  }
                  if (e.key === "Enter" && highlighted) {
                    e.preventDefault();
                    choose(highlighted);
                  }
                }}
              />
            </div>
            <DocumentRows
              id={`${id}-list`}
              documents={filtered}
              active={active}
              highlight={highlighted}
              select={choose}
              picker
            />
            {!filtered.length && (
              <p className="document-picker-empty" role="status">
                No documents found.
              </p>
            )}
            <div className="document-picker-count">
              {filtered.length}{" "}
              {filtered.length === 1 ? "document" : "documents"}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function DocumentActions({
  title,
  rename,
  remove,
}: {
  title: string;
  rename: () => void;
  remove: () => void;
}) {
  const popover = useHeaderPopover();
  const id = useId();
  return (
    <>
      <button
        ref={popover.trigger}
        className="icon-button workspace-actions-trigger"
        aria-label="Document actions"
        title="Document actions"
        aria-haspopup="menu"
        aria-expanded={popover.open}
        aria-controls={popover.open ? id : undefined}
        onClick={() => (popover.open ? popover.close() : popover.show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            popover.show(e.key === "ArrowUp");
          }
        }}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {popover.open &&
        createPortal(
          <div
            ref={popover.panel}
            id={id}
            className="header-popover document-actions-menu"
            role="menu"
            aria-label="Document actions"
            onKeyDown={(e) => {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]',
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "ArrowDown"
                  ? (index + 1) % items.length
                  : e.key === "ArrowUp"
                    ? (index - 1 + items.length) % items.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? items.length - 1
                        : undefined;
              if (next !== undefined) {
                e.preventDefault();
                items[next]?.focus();
              }
            }}
          >
            <div className="document-actions-title" title={title}>
              For {title}
            </div>
            <button
              role="menuitem"
              onClick={() => {
                popover.close();
                rename();
              }}
            >
              <Pencil size={15} aria-hidden="true" />
              Rename
            </button>
            <button
              role="menuitem"
              className="destructive-action"
              onClick={() => {
                popover.close();
                remove();
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

export function WorkspaceHeader({
  documents,
  active,
  select,
  rename,
  remove,
}: {
  documents: WorkspaceDocument[];
  active: string;
  select: (id: string) => void;
  rename: () => void;
  remove: () => void;
}) {
  const title =
    documents.find((d) => d.id === active)?.title ?? "Untitled document";
  return (
    <div className="workspace-header-group">
      <span className="workspace-name">Personal workspace</span>
      <DocumentActions title={title} rename={rename} remove={remove} />
      <DocumentSelector documents={documents} active={active} select={select} />
    </div>
  );
}
