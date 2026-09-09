import { useEffect, useRef, useState, type RefObject } from "react";
import type { DocumentSnapshot } from "@folio/engine/types";
import type {
  Annotation,
  AnnotationSet,
} from "../../../packages/engine/src/annotations";
import { readAnnotations, saveAnnotations } from "./storage";
import { download } from "./assets";

export function useAnnotations(
  doc: DocumentSnapshot,
  article: RefObject<HTMLElement | null>,
  layoutKey: string,
  restoreKey = 0,
) {
  const [set, setSet] = useState<AnnotationSet | null>(null),
    [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [past, setPast] = useState<Annotation[][]>([]),
    [future, setFuture] = useState<Annotation[][]>([]);
  const versions = useRef(new Map<string, string>()),
    chain = useRef(Promise.resolve()),
    epoch = useRef(0);
  const currentDoc = useRef(doc);
  currentDoc.current = doc;
  const latest = useRef(set);
  latest.current = set;
  const lastSaved = useRef("");
  const unsaved = useRef(new Map<string, AnnotationSet>());
  const [unsavedCount, setUnsavedCount] = useState(0);
  const stale =
    !!set &&
    (set.documentId !== doc.id ||
      set.snapshot.source !== doc.source ||
      JSON.stringify(set.snapshot.assets) !== JSON.stringify(doc.assets) ||
      JSON.stringify(set.snapshot.settings) !== JSON.stringify(doc.settings) ||
      set.contextKey !== layoutKey);
  const persist = (value: AnnotationSet) => {
    chain.current = chain.current.then(async () => {
      if (lastSaved.current === value.version) return;
      try {
        await saveAnnotations(value, versions.current.get(value.id));
        versions.current.set(value.id, value.version);
        if (
          (unsaved.current.get(value.id)?.updatedAt ?? 0) <=
          (value.updatedAt ?? 0)
        )
          unsaved.current.delete(value.id);
        setUnsavedCount(unsaved.current.size);
        lastSaved.current = value.version;
        if (latest.current?.id === value.id) {
          setStatus(
            latest.current.version === value.version
              ? "Notes saved on this device"
              : "Saving notes…",
          );
          setError("");
        }
      } catch (e) {
        unsaved.current.set(value.id, value);
        setUnsavedCount(unsaved.current.size);
        if (latest.current?.id === value.id) {
          setError(String(e));
          setStatus("Notes not saved");
        }
      }
    });
  };
  useEffect(() => {
    const token = ++epoch.current;
    setLoaded(false);
    setSet(null);
    setEnabled(false);
    setPast([]);
    setFuture([]);
    setError("");
    setStatus("Opening notes…");
    void chain.current
      .then(() => readAnnotations(doc.id))
      .then((sets) => {
        if (epoch.current !== token) return;
        sets.sort(
          (a, b) => (a.updatedAt ?? a.revision) - (b.updatedAt ?? b.revision),
        );
        sets.forEach((s) => {
          if (!unsaved.current.has(s.id)) versions.current.set(s.id, s.version);
        });
        const recover = [...unsaved.current.values()]
          .filter((s) => s.documentId === doc.id)
          .at(-1);
        const match =
          recover ??
          sets.filter((s) => s.snapshot.source === doc.source).at(-1) ??
          sets.at(-1) ??
          null;
        setSet(match);
        lastSaved.current = recover ? "" : (match?.version ?? "");
        setStatus(
          recover
            ? "Notes not saved"
            : match
              ? "Notes saved on this device"
              : "",
        );
        if (recover)
          setError(
            "Recovered unsaved notes from this session. Retry saving or download a backup.",
          );
      })
      .catch((e) => {
        if (epoch.current === token) {
          setError(`Notes recovery unavailable: ${String(e)}`);
          setStatus("Notes not saved");
        }
      })
      .finally(() => {
        if (epoch.current === token) setLoaded(true);
      });
  }, [doc.id, restoreKey]);
  useEffect(() => {
    if (!set || !loaded || set.version === lastSaved.current) return;
    setStatus("Saving notes…");
    const timer = setTimeout(() => persist(set), 350);
    return () => {
      clearTimeout(timer);
      persist(set);
    };
  }, [set, loaded]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        unsaved.current.size ||
        (latest.current && latest.current.version !== lastSaved.current)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const capture = async (objects: Annotation[] = []) => {
    const el = article.current;
    if (!el) return;
    const original = doc;
    await document.fonts.ready;
    await Promise.all(
      [...el.querySelectorAll("img")].map((i) => i.decode().catch(() => {})),
    );
    if (currentDoc.current !== original) {
      setError(
        "Document changed while preparing annotations. Try again after rendering completes.",
      );
      return;
    }
    // Exports use static video links; freeze that same representation before drawing.
    for (const node of el.querySelectorAll("[data-video-url]")) {
      for (const control of node.querySelectorAll("button,iframe")) {
        if (control.previousSibling instanceof HTMLBRElement)
          control.previousSibling.remove();
        control.remove();
      }
    }
    const css = getComputedStyle(el),
      rect = el.getBoundingClientRect(),
      factor = rect.width / el.offsetWidth;
    const blocks = [
      ...el.querySelectorAll<HTMLElement>("[data-source-start]"),
    ].map((block) => {
      const r = block.getBoundingClientRect();
      return {
        id: block.id,
        x: (r.x - rect.x) / factor,
        y: (r.y - rect.y) / factor,
        width: r.width / factor,
        height: r.height / factor,
      };
    });
    const value: AnnotationSet = {
      schema: 1,
      id: crypto.randomUUID(),
      documentId: original.id,
      revision: original.revision,
      version: crypto.randomUUID(),
      updatedAt: Date.now(),
      snapshot: structuredClone(original),
      blocks,
      contextKey: layoutKey,
      previewHtml: el.innerHTML,
      layout: {
        mediaWidth: innerWidth,
        width: el.offsetWidth,
        height: el.offsetHeight,
        fontSize: parseFloat(css.getPropertyValue("--doc-font")) || 16,
        lineHeight: Number(css.getPropertyValue("--doc-leading")) || 1.8,
        padding: [
          css.paddingTop,
          css.paddingRight,
          css.paddingBottom,
          css.paddingLeft,
        ].map(parseFloat),
        theme: el.dataset.theme as "light" | "dark",
      },
      objects: structuredClone(objects),
    };
    setSet(value);
    setPast([]);
    setFuture([]);
    setEnabled(true);
  };
  const change = (objects: Annotation[]) => {
    if (!set) return;
    setPast((p) => [...p.slice(-99), set.objects]);
    setFuture([]);
    setSet({
      ...set,
      objects,
      version: crypto.randomUUID(),
      updatedAt: Date.now(),
    });
  };
  return {
    unsavedCount,
    backupUnsaved: () =>
      download(
        JSON.stringify([...unsaved.current.values()], null, 2),
        "unsaved-annotations.folio.json",
        "application/json",
      ),
    set,
    stale,
    enabled: enabled && !stale,
    loaded,
    status,
    error,
    capture,
    toggle: () => {
      if (set && !stale) setEnabled(!enabled);
      else if (!stale) void capture();
    },
    change,
    undo: () => {
      if (!set || !past.length) return;
      setFuture((f) => [set.objects, ...f]);
      setSet({
        ...set,
        objects: past.at(-1)!,
        version: crypto.randomUUID(),
        updatedAt: Date.now(),
      });
      setPast((p) => p.slice(0, -1));
    },
    redo: () => {
      if (!set || !future.length) return;
      setPast((p) => [...p, set.objects]);
      setSet({
        ...set,
        objects: future[0],
        version: crypto.randomUUID(),
        updatedAt: Date.now(),
      });
      setFuture((f) => f.slice(1));
    },
    canUndo: !!past.length,
    canRedo: !!future.length,
    retry: () => {
      if (set) persist(set);
    },
    backup: () => {
      if (set)
        download(
          JSON.stringify(set, null, 2),
          "annotations.folio.json",
          "application/json",
        );
    },
  };
}
