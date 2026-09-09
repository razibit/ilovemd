import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
  type CSSProperties,
} from "react";
import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import {
  BookOpen,
  Hand,
  PanelLeftClose,
  PanelLeftOpen,
  Columns2,
  Eye,
  Code2,
  ArrowDownToLine,
  ChevronDown,
  Plus,
  FileText,
  Search,
  Settings2,
  Link2,
  Check,
  ImagePlus,
  Command,
  Sun,
  Moon,
  Monitor,
  ArrowUpRight,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Link,
  Heading2,
  List,
  Quote,
  Code,
  Maximize2,
  AlertCircle,
  X,
  MoreVertical,
  Clock,
  FolderOpen,
  Download,
  LoaderCircle,
  AlignLeft,
  ChevronRight,
  ShieldCheck,
  FileArchive,
} from "lucide-react";
import {
  defaultSettings,
  defaultExportOptions,
  type DocumentSnapshot,
  type RenderResult,
  type Diagnostic,
  type ExportOptions,
  type Asset,
  type ExportResult,
} from "@folio/engine/types";
import { Editor } from "./Editor";
import { sample, templates } from "./sample";
import {
  restore,
  save,
  history,
  readPreferences,
  writePreferences,
  type Saved,
} from "./storage";
import { imageAsset, download } from "./assets";
import { renderDiagrams } from "./diagrams";
import { prepareEmbeds } from "./media";
import { AnnotationLayer } from './AnnotationLayer';
import { AnnotationToolbar, defaultToolSettings } from './AnnotationToolbar';
import { useAnnotations } from './useAnnotations';
import { usePreviewNavigation } from './usePreviewNavigation';
import { InstallBanner } from "./InstallBanner";
import { TemplateIcon, AnnotateIcon } from "./WorkspaceIcons";
import { PortfolioLink } from "./PortfolioLink";
import { CreatorAttribution } from "./CreatorAttribution";
import { errorCode, track } from "./analytics";
import { PreviewControls } from './PreviewControls';
import { ZoomPopover } from './ZoomPopover';
import { useToolbarVisibility } from './useToolbarVisibility';
import DOMPurify from 'dompurify';
import { overlaySvg } from '../../../packages/engine/src/annotations';
import { reconcileDocument } from "./reconcile";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import supportMatrix from '../../../docs/support-matrix.json';
const PdfPreview = lazy(() =>
  import("./PdfPreview").then((m) => ({ default: m.PdfPreview })),
);
const initial: DocumentSnapshot = {
  id: crypto.randomUUID(),
  revision: 0,
  source: sample,
  settings: defaultSettings,
  assets: {},
};
type Preferences = {
  theme: "system" | "light" | "dark";
  documentTheme: "light" | "dark";
  fontSize: number;
  lineHeight: number;
  width: number;
  zoom: number;
  sync: boolean;
  outline: boolean;
};
const prefDefaults: Preferences = {
  theme: "system",
  documentTheme: "light",
  fontSize: 16,
  lineHeight: 1.8,
  width: 760,
  zoom: 100,
  sync: true,
  outline: innerWidth >= 900,
};
function restorePreferences(value: unknown): Preferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const number = (key: keyof Pick<Preferences, "fontSize" | "lineHeight" | "width" | "zoom">, min: number, max: number) => {
    const candidate = saved[key];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(min, Math.min(max, candidate))
      : prefDefaults[key];
  };
  return {
    theme: ["system", "light", "dark"].includes(saved.theme as string) ? saved.theme as Preferences["theme"] : prefDefaults.theme,
    documentTheme: ["light", "dark"].includes(saved.documentTheme as string) ? saved.documentTheme as Preferences["documentTheme"] : prefDefaults.documentTheme,
    fontSize: number("fontSize", 12, 24),
    lineHeight: number("lineHeight", 1.3, 2.4),
    width: number("width", 480, 1100),
    zoom: number("zoom", 25, 400),
    sync: typeof saved.sync === "boolean" ? saved.sync : prefDefaults.sync,
    outline: typeof saved.outline === "boolean" ? saved.outline : prefDefaults.outline,
  };
}
function GitHubStarLink() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    fetch("https://api.github.com/repos/razibit/ilovemd")
      .then((r) => r.json())
      .then((d) => setStars(d.stargazers_count ?? null))
      .catch(() => {});
  }, []);
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return (
    <a
      href="https://github.com/razibit/ilovemd"
      target="_blank"
      rel="noopener noreferrer"
      className="github-star-link"
    >
      <svg viewBox="0 0 438.549 438.549" width="16" height="16" fill="currentColor" aria-hidden="true">
        <title>GitHub</title>
        <path d="M409.132 114.573c-19.608-33.596-46.205-60.194-79.798-79.8-33.598-19.607-70.277-29.408-110.063-29.408-39.781 0-76.472 9.804-110.063 29.408-33.596 19.605-60.192 46.204-79.8 79.8C9.803 148.168 0 184.854 0 224.63c0 47.78 13.94 90.745 41.827 128.906 27.884 38.164 63.906 64.572 108.063 79.227 5.14.954 8.945.283 11.419-1.996 2.475-2.282 3.711-5.14 3.711-8.562 0-.571-.049-5.708-.144-15.417a2549.81 2549.81 0 01-.144-25.406l-6.567 1.136c-4.187.767-9.469 1.092-15.846 1-6.374-.089-12.991-.757-19.842-1.999-6.854-1.231-13.229-4.086-19.13-8.559-5.898-4.473-10.085-10.328-12.56-17.556l-2.855-6.57c-1.903-4.374-4.899-9.233-8.992-14.559-4.093-5.331-8.232-8.945-12.419-10.848l-1.999-1.431c-1.332-.951-2.568-2.098-3.711-3.429-1.142-1.331-1.997-2.663-2.568-3.997-.572-1.335-.098-2.43 1.427-3.289 1.525-.859 4.281-1.276 8.28-1.276l5.708.853c3.807.763 8.516 3.042 14.133 6.851 5.614 3.806 10.229 8.754 13.846 14.842 4.38 7.806 9.657 13.754 15.846 17.847 6.184 4.093 12.419 6.136 18.699 6.136 6.28 0 11.704-.476 16.274-1.423 4.565-.952 8.848-2.383 12.847-4.285 1.713-12.758 6.377-22.559 13.988-29.41-10.848-1.14-20.601-2.857-29.264-5.14-8.658-2.286-17.605-5.996-26.835-11.14-9.235-5.137-16.896-11.516-22.985-19.126-6.09-7.614-11.088-17.61-14.987-29.979-3.901-12.374-5.852-26.648-5.852-42.826 0-23.035 7.52-42.637 22.557-58.817-7.044-17.318-6.379-36.732 1.997-58.24 5.52-1.715 13.706-.428 24.554 3.853 10.85 4.283 18.794 7.952 23.84 10.994 5.046 3.041 9.089 5.618 12.135 7.708 17.705-4.947 35.976-7.421 54.818-7.421s37.117 2.474 54.823 7.421l10.849-6.849c7.419-4.57 16.18-8.758 26.262-12.565 10.088-3.805 17.802-4.853 23.134-3.138 8.562 21.509 9.325 40.922 2.279 58.24 15.036 16.18 22.559 35.787 22.559 58.817 0 16.178-1.958 30.497-5.853 42.966-3.9 12.471-8.941 22.457-15.125 29.979-6.191 7.521-13.901 13.85-23.131 18.986-9.232 5.14-18.182 8.85-26.84 11.136-8.662 2.286-18.415 4.004-29.263 5.146 9.894 8.562 14.842 22.077 14.842 40.539v60.237c0 3.422 1.19 6.279 3.572 8.562 2.379 2.279 6.136 2.95 11.276 1.995 44.163-14.653 80.185-41.062 108.068-79.226 27.88-38.161 41.825-81.126 41.825-128.906-.01-39.771-9.818-76.454-29.414-110.049z" />
      </svg>
      {stars !== null && (
        <span className="github-star-count">{fmt(stars)}</span>
      )}
      <span className="sr-only">GitHub</span>
    </a>
  );
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}
export function App() {
  const [doc, setDoc] = useState(initial),
    [prefs, setPrefs] = useState(prefDefaults),
    [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("Opening workspace…"),
    [result, setResult] = useState<RenderResult | null>(null),
    [rendering, setRendering] = useState(true),
    [renderError, setRenderError] = useState(""),
    [extraDiagnostics, setExtraDiagnostics] = useState<Diagnostic[]>([]);
  const [viewMode, setViewMode] = useState<"split" | "preview" | "editor">(
      () => (innerWidth < 900 ? "editor" : "split"),
    ),
    [modal, setModal] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [records, setRecords] = useState<Saved[]>([]),
    [exportOptions, setExportOptions] = useState(defaultExportOptions),
    [exporting, setExporting] = useState(false),
    [exportResult, setExportResult] = useState<ExportResult | null>(null),
    [artifact, setArtifact] = useState<Blob | null>(null),
    [exportError, setExportError] = useState(""),
    [exportDiagnostics, setExportDiagnostics] = useState<Diagnostic[]>([]),
    [selectedBlock, setSelectedBlock] = useState(""),
    [split, setSplit] = useState(50),
    [macroText, setMacroText] = useState("{}"),
    [htmlText, setHtmlText] = useState(""),
    [converted, setConverted] = useState(""),
    [imageDraft, setImageDraft] = useState<{
      asset: Asset;
      alt: string;
      caption: string;
      width: number;
    } | null>(null),
    [systemDark, setSystemDark] = useState(
      matchMedia("(prefers-color-scheme: dark)").matches,
    );
  const editor = useRef<EditorView | null>(null),
    preview = useRef<HTMLDivElement>(null),
    article = useRef<HTMLElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    version = useRef<string | undefined>(undefined),
    docRef = useRef(doc),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    workerBusy = useRef(false),
    renderDeadline = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    createWorker = useRef<() => void>(() => {}),
    syncOwner = useRef<"editor" | "preview" | null>(null),
    lastScrollOwner = useRef<"editor" | "preview">("editor"),
    syncCallback = useRef<(origin: "editor" | "preview") => void>(() => {}),
    syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    conflicted = useRef(false),
    exportAbort = useRef<AbortController | null>(null),
    saveChain = useRef(Promise.resolve());
  const surface = useRef<HTMLDivElement>(null), mainWorkspace = useRef<HTMLElement>(null), suppressNavigation = useRef(0);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [drawingSettings, setDrawingSettings] = useState(defaultToolSettings);
  const annotatePointer = useRef("");
  const [preservedNotes, setPreservedNotes] = useState(false), [exportPreserved, setExportPreserved] = useState(false);
  const [previewSettled, setPreviewSettled] = useState(false);
  const [renderedSnapshot, setRenderedSnapshot] = useState<DocumentSnapshot | null>(null);
  const renderRequest = useRef<{key:string;snapshot:DocumentSnapshot} | null>(null);
  const [notesRestoreKey, setNotesRestoreKey] = useState(0);
  const notes = useAnnotations(doc, article, `${prefs.fontSize}|${prefs.lineHeight}|${prefs.width}`, notesRestoreKey);
  const navigation = usePreviewNavigation(preview, surface, prefs.zoom, n => setPrefs(p => ({ ...p, zoom: n })), suppressNavigation, ready);
  const toolbarHidden = useToolbarVisibility(mainWorkspace, suppressNavigation, ready);
  const activeNotes = notes.stale ? null : notes.set;
  const [previewWidth, setPreviewWidth] = useState(792);
  const baseWidth = activeNotes?.layout.width ?? Math.max(240, Math.min(prefs.width, previewWidth - 32));
  useEffect(() => { const el = preview.current; if (!el) return; const observer = new ResizeObserver(() => { if (el.clientWidth) setPreviewWidth(el.clientWidth); }); observer.observe(el); return () => observer.disconnect(); }, [ready]);
  const [surfaceSize, setSurfaceSize] = useState({ width: 760, height: 400 });
  useEffect(() => { const el = article.current; if (!el) return; const observer = new ResizeObserver(() => setSurfaceSize({ width: el.offsetWidth, height: el.offsetHeight })); observer.observe(el); return () => observer.disconnect(); }, [ready]);
  useEffect(() => { setExportPreserved(false); }, [doc.id, doc.revision]);
  docRef.current = doc;
  const dark =
    prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
  const diagnostics: Diagnostic[] = [
    ...(result?.diagnostics ?? []),
    ...extraDiagnostics,
    ...(renderError
      ? [
          {
            severity: "error" as const,
            code: "RENDER_FAILED",
            line: 1,
            message: renderError,
          },
        ]
      : []),
  ];
  const title = doc.source.match(/^#\s+(.+)$/m)?.[1] || "Untitled document";
  const words = doc.source.trim().split(/\s+/).filter(Boolean).length;
  useEffect(() => {
    void (async () => {
      try {
        const [saved, p] = await Promise.all([restore(), readPreferences()]);
        if (saved) {
          setDoc(saved.snapshot);
          version.current = saved.version;
        }
        if (p) setPrefs(restorePreferences(p));
        setSaveStatus(saved ? "Saved on this device" : "Ready to write");
      } catch (e) {
        setNotice(
          `Recovery unavailable: ${String(e)}. Download your source regularly.`,
        );
      } finally {
        setReady(true);
      }
    })();
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (ready)
      void writePreferences(prefs).catch(() =>
        setNotice("Settings could not be saved on this device."),
      );
  }, [prefs, ready, dark]);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus("Unsaved changes");
    const timer = setTimeout(() => {
      const snapshot = doc;
      saveChain.current = saveChain.current.then(async () => {
        try {
          version.current = await save(snapshot, version.current);
          if (docRef.current.revision === snapshot.revision)
            setSaveStatus("Saved on this device");
        } catch (e) {
          conflicted.current = String(e).includes("Another tab");
          setSaveStatus("Save needs attention");
          setNotice(String(e));
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [doc, ready]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (
        saveStatus === "Unsaved changes" ||
        saveStatus === "Save needs attention"
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [saveStatus]);
  useEffect(() => {
    if (!ready) return;
    createWorker.current = () => {
      const w = new Worker(new URL("./render.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (e) => {
        workerBusy.current = false;
        clearTimeout(renderDeadline.current);
        if (e.data.requestKey !== renderRequest.current?.key || renderRequest.current?.snapshot !== docRef.current) return;
        if (e.data.error) setRenderError(e.data.error);
        else {
          setResult(e.data.result);
          setRenderedSnapshot(docRef.current);
          setRenderError("");
        }
        setRendering(false);
      };
      w.onerror = (e) => {
        workerBusy.current = false;
        clearTimeout(renderDeadline.current);
        setRenderError(`Renderer failed: ${e.message}. Source is preserved.`);
        setRendering(false);
      };
    };
    createWorker.current();
    return () => {
      clearTimeout(renderDeadline.current);
      worker.current?.terminate();
    };
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    setRendering(true);
    const timer = setTimeout(() => {
      if (workerBusy.current || !worker.current) {
        worker.current?.terminate();
        createWorker.current();
      }
      clearTimeout(renderDeadline.current);
      workerBusy.current = true;
      const requestKey = crypto.randomUUID();
      renderRequest.current = {key:requestKey,snapshot:doc};
      worker.current?.postMessage({snapshot:doc,requestKey});
      renderDeadline.current = setTimeout(() => {
        worker.current?.terminate();
        worker.current = null;
        workerBusy.current = false;
        setRendering(false);
        setRenderError(
          "Rendering exceeded 10 seconds. Simplify the document; your source and last valid preview are preserved.",
        );
      }, 10000);
    }, 140);
    return () => clearTimeout(timer);
  }, [doc, ready]);
  useEffect(() => {
    const root = article.current;
    if (!root || !result) return;
    let cancelled = false;
    setPreviewSettled(false);
    reconcileDocument(root, result.html);
    prepareEmbeds(root);
    void renderDiagrams(root).then(async (errors) => {
      await document.fonts.ready;
      await Promise.all([...root.querySelectorAll("img")].map(i => i.decode().catch(() => {})));
      if (!cancelled) setPreviewSettled(true);
      if (!cancelled) {
        performance.mark("folio-preview-settled");
        try {
          performance.measure(
            "folio-edit-to-preview",
            "folio-edit",
            "folio-preview-settled",
          );
        } catch {}
      }
      if (!cancelled)
        setExtraDiagnostics(
          errors.map((message) => ({
            severity: "error",
            code: "DIAGRAM_RENDER",
            line: 1,
            message,
          })),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [result]);
  useEffect(() => {
    const narrow=matchMedia('(max-width:900px)');
    const collapse=()=>{if(narrow.matches)setPrefs(p=>({...p,outline:false}))};
    narrow.addEventListener('change',collapse);
    return()=>narrow.removeEventListener('change',collapse);
  },[]);
  useEffect(() => {
    setArtifact(null);
    setExportResult(null);
    exportAbort.current?.abort();
  }, [doc.revision, exportOptions,selectedBlock,notes.set?.version,exportPreserved]);
  const updateSource = useCallback((source: string) => {
    performance.mark("folio-edit");
    setDoc((d) =>
      d.source === source ? d : { ...d, source, revision: d.revision + 1 },
    );
  }, []);
  const insert = (text: string, before = "", after = "") => {
    const v = editor.current;
    if (v) {
      const { from, to } = v.state.selection.main;
      v.dispatch({
        changes: {
          from,
          to,
          insert: before + (text || v.state.sliceDoc(from, to)) + after,
        },
        selection: {
          anchor:
            from + before.length + (text || v.state.sliceDoc(from, to)).length,
        },
      });
      v.focus();
    } else updateSource(doc.source + text);
  };
  const navigate = (id: string, line?: number) => {
    setSelectedBlock(id);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (line && editor.current) {
      const v = editor.current;
      const pos = v.state.doc.line(Math.min(line, v.state.doc.lines)).from;
      v.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "start" }),
      });
    }
  };
  const synchronize = (origin: "editor" | "preview") => {
    if (performance.now() < suppressNavigation.current) return;
    if (
      !prefs.sync ||
      viewMode !== "split" ||
      !editor.current ||
      !preview.current ||
      !article.current ||
      (syncOwner.current && syncOwner.current !== origin)
    )
      return;
    syncOwner.current = origin;
    lastScrollOwner.current = origin;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => (syncOwner.current = null), 120);
    const v = editor.current;
    const p = preview.current;
    const elements = [
      ...article.current.querySelectorAll<HTMLElement>("[data-source-start]"),
    ];
    if (!elements.length) return;
    const points = elements
      .map((el) => {
        const line = Math.min(
          Number(el.dataset.sourceStart) || 1,
          v.state.doc.lines,
        );
        return {
          source: v.lineBlockAt(v.state.doc.line(line).from).top,
          preview:
            el.getBoundingClientRect().top -
            p.getBoundingClientRect().top +
            p.scrollTop,
        };
      })
      .sort((a, b) => a.source - b.source)
      .filter((a, i, arr) => !i || a.source !== arr[i - 1].source);
    points.push({
      source: v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight,
      preview: p.scrollHeight - p.clientHeight,
    });
    const input = origin === "editor" ? "source" : "preview",
      output = origin === "editor" ? "preview" : "source";
    const scroll = origin === "editor" ? v.scrollDOM.scrollTop : p.scrollTop;
    const sorted = [...points].sort((a, b) => a[input] - b[input]);
    let a = sorted[0],
      b = sorted.at(-1)!;
    for (let i = 0; i < sorted.length - 1; i++)
      if (scroll >= sorted[i][input] && scroll < sorted[i + 1][input]) {
        a = sorted[i];
        b = sorted[i + 1];
        break;
      }
    const factor = Math.max(
      0,
      Math.min(1, (scroll - a[input]) / Math.max(1, b[input] - a[input])),
    );
    const target = a[output] + factor * (b[output] - a[output]);
    if (origin === "editor") p.scrollTop = target;
    else v.scrollDOM.scrollTop = target;
  };
  syncCallback.current = synchronize;
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        syncCallback.current(lastScrollOwner.current),
      );
    });
    if (article.current) observer.observe(article.current);
    if (editor.current) observer.observe(editor.current.scrollDOM);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);
  useEffect(() => {
    if (modal === "settings")
      setMacroText(JSON.stringify(docRef.current.settings.macros, null, 2));
  }, [modal]);
  const handleImage = async (file: File) => {
    try {
      const asset = await imageAsset(file, file.name);
      setImageDraft({ asset, alt: "", caption: "", width: 100 });
      setModal("image");
      track({ event: "content_action", action: "paste_complete", content_type: "image" });
    } catch (e) {
      setNotice(String(e));
      track({ event: "app_error", feature: "import", error_code: errorCode(e) });
    }
  };
  const importFile = async (file: File) => {
    try {
      await saveChain.current;
      version.current = await save(docRef.current, version.current);
      if (file.size > 70 * 1024 * 1024)
        throw new Error("File exceeds import size limit.");
      if (file.name.endsWith(".zip")) {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (file) =>
            file.originalSize <= 50 * 1024 * 1024 &&
            !file.name.includes("..") &&
            !file.name.startsWith("/") &&
            !file.name.includes("\\"),
        });
        if (!entries["manifest.json"] || !entries["document.md"])
          throw new Error("This is not a compatible iLoveMd bundle.");
        const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
        const assets: Record<string, Asset> = {};
        let total = 0;
        for (const entry of manifest.assets ?? []) {
          const bytes = entries[entry.file];
          if (!bytes) throw new Error(`Missing bundled asset ${entry.file}`);
          total += bytes.length;
          if (total > 50 * 1024 * 1024)
            throw new Error("Bundle assets exceed 50 MiB.");
          assets[entry.path] = await imageAsset(
            new Blob([bytes as BlobPart]),
            entry.name || entry.path,
          );
        }
        const source = strFromU8(entries["document.md"]);
        if (new TextEncoder().encode(source).length > 2 * 1024 * 1024)
          throw new Error("Source exceeds 2 MiB.");
        setDoc((d) => ({
          ...d,
          id: crypto.randomUUID(),
          source,
          assets,
          settings: { ...defaultSettings, ...manifest.settings },
          revision: d.revision + 1,
        }));
      } else {
        if (file.size > 2 * 1024 * 1024)
          throw new Error("Markdown exceeds 2 MiB.");
        const source = await file.text();
        setDoc(d => ({ ...d, id: crypto.randomUUID(), source, assets: {}, revision: d.revision + 1 }));
      }
      setNotice(
        `Imported ${file.name}. Previous content remains in Local history.`,
      );
      track({ event: "content_action", action: "import_complete", content_type: file.name.endsWith(".zip") ? "bundle" : "markdown" });
    } catch (e) {
      setNotice(String(e));
      track({ event: "app_error", feature: "import", error_code: errorCode(e) });
    }
  };
  const bundle = () => {
    const entries: Record<string, Uint8Array> = {
      "document.md": strToU8(doc.source),
    };
    const assets = Object.entries(doc.assets).map(([path, a], i) => {
      const file = `assets/${i}.${a.mime.split("/")[1]}`;
      entries[file] = Uint8Array.from(atob(a.data.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      return { path, file, name: a.name, mime: a.mime };
    });
    entries["manifest.json"] = strToU8(
      JSON.stringify({ version: 1, settings: doc.settings, assets }, null, 2),
    );
    download(
      new Blob([zipSync(entries) as BlobPart], { type: "application/zip" }),
      "document.folio.zip",
    );
    setNotice("Markdown and assets exported together.");
  };
  const fetchRemote = async () => {
    setNotice("Fetching remote images without credentials…");
    try {
      const paths = [
        ...new Set(
          result?.resources.filter(
            (url) => /^https?:\/\//.test(url) && !doc.assets[url],
          ) ?? [],
        ),
      ];
      const assets = { ...doc.assets };
      for (const url of paths) {
        const response = await fetch(url, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        assets[url] = await imageAsset(await response.blob(), url);
      }
      setDoc((d) => ({ ...d, assets, revision: d.revision + 1 }));
      setNotice(`Stored ${paths.length} remote image(s) locally.`);
    } catch (e) {
      setNotice(
        `Image fetch failed: ${String(e)}. Upload a local copy instead.`,
      );
    }
  };
  const token = () => sessionStorage.getItem("folio-export-token") || "";
  const generateExport = async () => {
    const startedRevision = doc.revision, startedDocument = doc.id;
    setExporting(true);
    track({ event: "export_started", export_format: exportOptions.format, annotations_included: !!exportOptions.includeAnnotations });
    setExportError("");
    setExportDiagnostics([]);
    setArtifact(null);
    exportAbort.current = new AbortController();
    try {
      if (exportOptions.includeAnnotations && notes.stale && !exportPreserved) throw new Error("Choose the preserved annotated revision or disable Include annotations.");
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
        body: JSON.stringify({
          snapshot: exportOptions.includeAnnotations && exportPreserved && notes.set ? notes.set.snapshot : doc,
          annotations: exportOptions.includeAnnotations && notes.set ? { ...notes.set, snapshot: undefined, previewHtml: undefined } : undefined,
          options: { ...exportOptions, selection: selectedBlock },
        }),
        signal: exportAbort.current.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setExportDiagnostics(data.diagnostics ?? []);
        throw new Error(data.error || "Export failed");
      }
      const info = data as ExportResult;
      const downloadResponse = await fetch(info.artifacts[0].url, {
          headers: {
            "X-Export-Token": info.token,
            Accept:'application/json',
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
        signal: exportAbort.current.signal,
      });
      if (!downloadResponse.ok)
        throw new Error(
          "Artifact download failed. Please generate the export again.",
        );
      if(downloadResponse.status!==200)throw new Error('The artifact response was empty or intercepted by a download manager. No successful export has been recorded.');
      const transfer=await downloadResponse.json();
      if(typeof transfer.data!=='string'||!transfer.byteLength)throw new Error('The export service returned an empty artifact.');
      const bytes=Uint8Array.from(atob(transfer.data),c=>c.charCodeAt(0));
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
      if(bytes.byteLength!==transfer.byteLength||hash!==transfer.sha256)throw new Error('Artifact integrity verification failed. Generate a fresh export.');
      const blob=new Blob([bytes],{type:info.artifacts[0].mime});
      if (docRef.current.revision !== startedRevision || docRef.current.id !== startedDocument)
        throw new Error(
          "Document changed during export. Generate a fresh export.",
        );
      setArtifact(blob);
      setExportResult(info);
      setExportDiagnostics(info.warnings);
      track({ event: "export_completed", export_format: exportOptions.format, annotations_included: !!exportOptions.includeAnnotations });
      void fetch(`/api/exports/${info.id}`, {
        method: "DELETE",
        headers: {
          "X-Export-Token": info.token,
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
      });
    } catch (e) {
      setExportError(String(e));
      track({ event: "export_failed", export_format: exportOptions.format, annotations_included: !!exportOptions.includeAnnotations, error_code: errorCode(e) });
    } finally {
      setExporting(false);
    }
  };
  const openHistory = async () => {
    try {
      setRecords(await history());
      setModal("history");
    } catch (e) {
      setNotice(String(e));
    }
  };
  const actions = [
    {
      label: "Export document",
      shortcut: "Ctrl ⇧ E",
      run: () => setModal("export"),
    },
    {
      label: "Import Markdown or bundle",
      shortcut: "",
      run: () => fileInput.current?.click(),
    },
    {
      label: "Find and replace",
      shortcut: "Ctrl F",
      run: () => {
        if (editor.current) openSearchPanel(editor.current);
      },
    },
    { label: "Local history", shortcut: "", run: openHistory },
    {
      label: "Reading settings",
      shortcut: "",
      run: () => setModal("settings"),
    },
    {
      label: "Toggle sync scroll",
      shortcut: "",
      run: () => setPrefs((p) => ({ ...p, sync: !p.sync })),
    },
    {
      label: "Switch preview theme",
      shortcut: "",
      run: () =>
        setPrefs((p) => ({
          ...p,
          documentTheme: p.documentTheme === "light" ? "dark" : "light",
        })),
    },
    {
      label: "Download Markdown",
      shortcut: "",
      run: () => download(doc.source, "document.md", "text/markdown"),
    },
  ];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("commands");
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "e"
      ) {
        e.preventDefault();
        setModal("export");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        download(docRef.current.source, "document.md", "text/markdown");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (!ready)
    return (
      <main className="loading">
        <BookOpen />
        <p>Opening your workspace…</p>
      </main>
    );
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file)
          void (file.type.startsWith("image/")
            ? handleImage(file)
            : importFile(file));
      }}
    >
      <input
        hidden
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.txt,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImage(f);
          e.target.value = "";
        }}
      />
      <InstallBanner />
      <header className="app-header">
        <a
          className="brand"
          href="#"
          aria-label="iLoveMd.tech home"
          onClick={(e) => e.preventDefault()}
        >
          <span className="brand-mark">
            <span aria-hidden="true">M↓</span>
          </span>
          <span>iLoveMd<span className="brand-dot">.tech</span></span>
        </a>
        <span className="header-divider" />
        <span className="workspace-name">Personal workspace</span>

        <div className="header-actions">
          <button
            className="quiet-button command-trigger"
            onClick={() => setModal("commands")}
          >
            <Search size={15} />
            <span>Find anything</span>
            <kbd>⌘ K</kbd>
          </button>
          <IconButton
            label="Settings"
            onClick={() => {
              setMacroText(JSON.stringify(doc.settings.macros, null, 2));
              setModal("settings");
            }}
          >
            <Settings2 size={18} />
          </IconButton>
          <GitHubStarLink />
        </div>
      </header>
      <div className="app-body">
        {prefs.outline && (
          <aside className="sidebar">
            <div className="sidebar-heading">
              <span>WORKSPACE</span>
              <IconButton
                label="New document"
                onClick={() => setModal("templates")}
              >
                <Plus size={16} />
              </IconButton>
            </div>
            <button
              className="document-item active"
              onClick={() => navigate(result?.outline[0]?.id || "block-0", 1)}
            >
              <FileText size={17} />
              <span>
                {title === "A place for your best thinking."
                  ? "Welcome to iLoveMd"
                  : title}
              </span>
              <span className="tiny-dot" />
            </button>
            <button
              className="sidebar-action"
              onClick={() => fileInput.current?.click()}
            >
              <FolderOpen size={16} />
              Import document
            </button>
            <div className="outline-title">
              IN THIS DOCUMENT <span>{result?.outline.length ?? 0}</span>
            </div>
            <nav aria-label="Document outline">
              {result?.outline
                .filter((h) => h.level <= 3)
                .map((h) => (
                  <button
                    key={h.id}
                    className={`outline-item ${selectedBlock === h.id ? "selected" : ""}`}
                    style={{ paddingLeft: 14 + (h.level - 1) * 10 }}
                    onClick={() => navigate(h.id, h.line)}
                  >
                    {h.level === 1 ? (
                      <span className="outline-dot" />
                    ) : (
                      <span className="outline-line" />
                    )}
                    <span>{h.text}</span>
                  </button>
                ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="device-note">
                <ShieldCheck size={17} />
                <div>
                  <strong>Your words, your device.</strong>
                  <p>Saved locally. Yours to keep.</p>
                </div>
              </div>
              <button className="sidebar-action" onClick={openHistory}>
                <Clock size={16} />
                Local history
              </button>
              <button
                className="sidebar-action"
                onClick={() => setModal("support")}
              >
                <BookOpen size={16} />
                Syntax & support <ArrowUpRight size={13} />
              </button>
              <CreatorAttribution />
              <div className="sidebar-footer">
                <span>iLoveMd · v0.1</span>
                {import.meta.env.VITE_PORTFOLIO_URL &&
                  /^https?:\/\//.test(import.meta.env.VITE_PORTFOLIO_URL) && (
                    <PortfolioLink href={import.meta.env.VITE_PORTFOLIO_URL}>
                      Made by <ArrowUpRight size={12} />
                    </PortfolioLink>
                  )}
                <span className="theme-buttons">
                  <IconButton
                    label="Light interface"
                    active={prefs.theme === "light"}
                    onClick={() => { setPrefs((p) => ({ ...p, theme: "light" })); track({ event: "tool_interaction", feature: "interface_theme", action: "light" }); }}
                  >
                    <Sun size={14} />
                  </IconButton>
                  <IconButton
                    label="Dark interface"
                    active={prefs.theme === "dark"}
                    onClick={() => { setPrefs((p) => ({ ...p, theme: "dark" })); track({ event: "tool_interaction", feature: "interface_theme", action: "dark" }); }}
                  >
                    <Moon size={14} />
                  </IconButton>
                  <IconButton
                    label="System interface theme"
                    active={prefs.theme === "system"}
                    onClick={() => { setPrefs((p) => ({ ...p, theme: "system" })); track({ event: "tool_interaction", feature: "interface_theme", action: "system" }); }}
                  >
                    <Monitor size={14} />
                  </IconButton>
                </span>
              </div>
            </div>
          </aside>
        )}
        <main className="main-workspace" ref={mainWorkspace}>
          <div className="toolbar-slot"><div inert={toolbarHidden} aria-hidden={toolbarHidden || undefined} className={`workspace-toolbar ${toolbarHidden ? "toolbar-hidden" : ""}`}>
            <div className="document-identity">
              <IconButton
                label={prefs.outline ? "Hide outline" : "Show outline"}
                onClick={() => setPrefs((p) => ({ ...p, outline: !p.outline }))}
              >
                {prefs.outline ? (
                  <PanelLeftClose size={18} />
                ) : (
                  <PanelLeftOpen size={18} />
                )}
              </IconButton>
              <span className="breadcrumb">
                Documents <ChevronRight size={13} />
              </span>
              <span className="document-title">
                {title === "A place for your best thinking."
                  ? "Welcome to iLoveMd"
                  : title}
              </span>
              <span className="md-label">.md</span>
            </div>
            <div className="document-actions">
                  <button className="quiet-button document-theme-button"
                    onClick={() => {
                      track({ event: "tool_interaction", feature: "document_theme", action: prefs.documentTheme === "light" ? "dark" : "light" });
                      setPrefs((p) => ({
                        ...p,
                        documentTheme:
                          p.documentTheme === "light" ? "dark" : "light",
                      }));
                    }}
                    title="Toggle document theme"
                    aria-label="Toggle document theme"
                  >
                    {prefs.documentTheme === "light" ? (
                      <Sun size={13} />
                    ) : (
                      <Moon size={13} />
                    )}{" "}
                    <span className="action-label">{prefs.documentTheme === "light"
                      ? "Light paper"
                      : "Dark paper"}</span>
                  </button>
              <button
                className="quiet-button templates-button" aria-label="Templates" title="Templates"
                onClick={() => setModal("templates")}
              >
                <TemplateIcon /><span className="action-label">Templates</span>
              </button>
              <button
                className="primary-button" aria-label="Export" title="Export"
                onClick={() => setModal("export")}
              >
                <ArrowDownToLine size={16} />
                <span className="action-label">Export</span><ChevronDown className="action-chevron" size={14} />
              </button>
            </div>
            <div
              className="view-switch"
              role="group"
              aria-label="Workspace view"
            >
              {(
                [
                  { key: "split", label: "Split view", icon: Columns2 },
                  { key: "editor", label: "Editor", icon: Code2 },
                  { key: "preview", label: "Preview", icon: Eye },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setViewMode(key); track({ event: "tool_interaction", feature: "workspace_view", action: key }); }}
                  aria-label={label}
                  title={label}
                  aria-pressed={viewMode === key}
                  className={viewMode === key ? "selected" : ""}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <details className="workspace-more" onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label="More workspace controls" title="More controls"><MoreVertical size={16} /></summary><div className="view-actions">
              <button
                className={`sync-toggle ${prefs.sync ? "enabled" : ""}`}
                role="switch"
                aria-label="Sync scroll"
                aria-checked={prefs.sync}
                onClick={() => { setPrefs((p) => ({ ...p, sync: !p.sync })); track({ event: "tool_interaction", feature: "sync_scroll", action: prefs.sync ? "disabled" : "enabled" }); }}
              >
                <Link2 size={14} />
                <span>Sync scroll</span>
                <span className="switch-track">
                  <i />
                </span>
              </button>

            </div></details>
          </div>
          </div>
          <div
            className={`panels mode-${viewMode}`}
            ref={workspace}
            style={{ "--split": `${split}%` } as CSSProperties}
          >
            <section
              className="source-panel"
              aria-label="Source editor"
              style={{ display: viewMode === "preview" ? "none" : undefined }}
            >
              <div className="format-bar">
                <IconButton
                  label="Undo"
                  onClick={() => {
                    if (editor.current) undo(editor.current);
                  }}
                >
                  <Undo2 size={15} />
                </IconButton>
                <IconButton
                  label="Redo"
                  onClick={() => {
                    if (editor.current) redo(editor.current);
                  }}
                >
                  <Redo2 size={15} />
                </IconButton>
                <span className="vertical-rule" />
                <IconButton label="Heading" onClick={() => insert("", "## ")}>
                  <Heading2 size={17} />
                </IconButton>
                <IconButton label="Bold" onClick={() => insert("", "**", "**")}>
                  <Bold size={16} />
                </IconButton>
                <IconButton label="Italic" onClick={() => insert("", "*", "*")}>
                  <Italic size={16} />
                </IconButton>
                <IconButton
                  label="Insert link"
                  onClick={() =>
                    insert("link text", "[", "](https://example.com)")
                  }
                >
                  <Link size={16} />
                </IconButton>
                <IconButton
                  label="Insert image"
                  onClick={() => imageInput.current?.click()}
                >
                  <ImagePlus size={16} />
                </IconButton>
                <span className="vertical-rule" />
                <IconButton
                  label="Bullet list"
                  onClick={() => insert("", "- ")}
                >
                  <List size={17} />
                </IconButton>
                <IconButton label="Blockquote" onClick={() => insert("", "> ")}>
                  <Quote size={15} />
                </IconButton>
                <IconButton
                  label="Inline code"
                  onClick={() => insert("", "`", "`")}
                >
                  <Code size={17} />
                </IconButton>
                <IconButton
                  label="Find and replace"
                  onClick={() => {
                    if (editor.current) openSearchPanel(editor.current);
                  }}
                >
                  <Search size={15} />
                </IconButton>
              </div>
              <Editor
                source={doc.source}
                onChange={updateSource}
                onReady={(v) => (editor.current = v)}
                onScroll={() => synchronize("editor")}
                onPasteImage={handleImage}
                dark={dark}
              />
            </section>
            {viewMode === "split" && (
              <div
                className="resizer"
                role="separator"
                aria-label="Resize editor and preview"
                aria-orientation="vertical"
                aria-valuenow={split}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setSplit((s) =>
                      Math.max(
                        25,
                        Math.min(75, s + (e.key === "ArrowLeft" ? -2 : 2)),
                      ),
                    );
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (
                    e.currentTarget.hasPointerCapture(e.pointerId) &&
                    workspace.current
                  ) {
                    const bounds = workspace.current.getBoundingClientRect();
                    setSplit(
                      Math.max(
                        25,
                        Math.min(
                          75,
                          ((e.clientX - bounds.left) / bounds.width) * 100,
                        ),
                      ),
                    );
                  }
                }}
                onPointerUp={(e) =>
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              >
                <span />
              </div>
            )}
            <section
              className="preview-panel"
              aria-label="Document preview"
              style={{ display: viewMode === "editor" ? "none" : undefined }}
            >
              <AnnotationToolbar pan={navigation.pan} chooseTool={() => navigation.setHand(false)} visible={notes.enabled && viewMode !== "editor"} close={notes.toggle} selected={!!selectedNote} remove={() => { if (notes.set) notes.change(notes.set.objects.filter(a => a.id !== selectedNote)); setSelectedNote(null); }} settings={drawingSettings} change={next => { if (next.tool !== drawingSettings.tool) track({ event: "tool_interaction", feature: "annotation_tool", action: next.tool }); const selected=notes.set?.objects.find(a=>a.id===selectedNote); const effective=drawingSettings.tool === 'select' && next.tool === 'select' && selected?.tool === 'highlighter' ? {...next,opacity:Math.min(.45,next.opacity)} : next; setDrawingSettings(effective); if (drawingSettings.tool === 'select' && next.tool === 'select' && notes.set && selectedNote) notes.change(notes.set.objects.map(a => a.id === selectedNote ? {...a,color:effective.color,width:effective.width,opacity:effective.opacity} : a)); }} undo={notes.undo} redo={notes.redo} canUndo={notes.canUndo} canRedo={notes.canRedo} clear={() => { if (confirm('Clear all annotations on this revision? You can undo this action.')) notes.change([]); }}/>
              {notes.stale && <div className="annotation-notice" role="status">Notes belong to an earlier layout. <button onClick={() => setPreservedNotes(true)}>Review preserved notes</button><button disabled={!previewSettled || rendering} onClick={() => { if (confirm('Copy these notes onto the current layout for review? Positions may need manual adjustment. The original notes will be preserved.')) void notes.capture(notes.set?.objects); }}>Adopt onto current layout</button></div>}
              {notes.unsavedCount > 0 && <div className="unsaved-notice" role="status">Unsaved notes are retained in this session. <button onClick={notes.backupUnsaved}>Back up all unsaved notes</button></div>}
              {notes.error && <div className="annotation-notice" role="alert">{notes.error}<button onClick={notes.retry}>Retry save</button><button onClick={notes.backup}>Download notes backup</button></div>}
              <div
                {...navigation.panProps}
                className={`preview-scroll ${navigation.pan ? 'pan-active' : ''}`}
                tabIndex={0}
                aria-label="Scrollable document preview"
                ref={preview}
                onScroll={() => synchronize("preview")}
              >

                {renderError && (
                  <p role="alert" className="inline-error">
                    {renderError} Last valid preview shown.
                  </p>
                )}
                <div className="preview-stage" style={{ width: (activeNotes?.layout.width ?? surfaceSize.width) * prefs.zoom / 100, height: (activeNotes?.layout.height ?? surfaceSize.height) * prefs.zoom / 100 }}>
                <div ref={surface} className="preview-surface" style={{ width: baseWidth, transform: `scale(${prefs.zoom / 100})`, transformOrigin: 'top left' }}>
                <article
                  className="document"
                  ref={article}
                  data-annotated={!!activeNotes}
                  data-theme={prefs.documentTheme}
                  style={
                    {
                      "--doc-font": `${prefs.fontSize}px`,
                      "--doc-leading": prefs.lineHeight,
                      "--annotation-columns": (activeNotes?.layout.mediaWidth ?? innerWidth) <= 650 ? 1 : 2,
                      width: baseWidth,
                      maxWidth: "none",
                      ...(activeNotes ? { padding: activeNotes.layout.padding.map(x => `${x}px`).join(" ") } : {}),
                    } as CSSProperties
                  }
                  onClick={(e) => {
                    const el = (e.target as HTMLElement).closest<HTMLElement>(
                      "[data-source-start]",
                    );
                    if (el) setSelectedBlock(el.id);
                    const link = (e.target as HTMLElement).closest("a");
                    if (link?.getAttribute("href")?.startsWith("#")) {
                      e.preventDefault();
                      document
                        .getElementById(link.getAttribute("href")!.slice(1))
                        ?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                />
                {activeNotes && renderedSnapshot === doc && previewSettled && <AnnotationLayer selected={selectedNote} select={id => { setSelectedNote(id); const a=activeNotes.objects.find(a=>a.id===id); if(a) setDrawingSettings(s=>({...s,color:a.color,width:a.width,opacity:a.opacity})); }} set={activeNotes} enabled={notes.enabled && !navigation.pan} settings={drawingSettings} change={notes.change} undo={notes.undo} redo={notes.redo}/>}
                </div></div>
                <div className="document-end">
                  <span />
                  END OF DOCUMENT
                  <span />
                </div>
              </div>

            </section>
          </div>
          <footer className="status-bar">
            <span className="save-indicator">
              <Check size={13} />
              {saveStatus}
            </span>
            <span className="status-middle">
              {words.toLocaleString()} words<span>·</span>
              {doc.source.length.toLocaleString()} characters<span>·</span>
              {Math.max(1, Math.ceil(words / 220))} min read
            </span>
            <div className="interaction-controls">
              <button aria-label="Annotate" title="Annotate" aria-pressed={notes.enabled}
                disabled={!notes.loaded || !previewSettled || rendering || renderedSnapshot !== doc || notes.stale}
                onPointerDown={e => { annotatePointer.current = e.pointerType; }}
                onKeyDown={() => { annotatePointer.current = ""; }}
                onClick={() => { navigation.setHand(!notes.enabled && annotatePointer.current === "touch"); annotatePointer.current = ""; notes.toggle(); }}><AnnotateIcon /></button>
              <button aria-label="Pan page" title="Pan page (hold Space to pan temporarily)" aria-pressed={navigation.pan}
                onClick={() => navigation.setHand(!navigation.hand)}><Hand size={18} aria-hidden="true" /></button>
            </div>
            <button
              className={
                diagnostics.length
                  ? "diagnostic-status has-issues"
                  : "diagnostic-status"
              }
              onClick={() => setModal("diagnostics")}
            >
              {diagnostics.length ? (
                <AlertCircle size={13} />
              ) : (
                <Check size={13} />
              )}{" "}
              {diagnostics.length
                ? `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}`
                : "No issues"}
            </button>
            <ZoomPopover zoom={prefs.zoom}>
              <PreviewControls zoom={prefs.zoom} change={(n,reset) => navigation.applyZoom(n,undefined,reset)} fit={navigation.fit}/>
            </ZoomPopover>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <IconButton
            label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
      {modal === "commands" && (
        <Modal title="Command palette" onClose={() => setModal("")}>
          <div className="modal-content">
            <input
              autoFocus
              className="command-search"
              aria-label="Find a command"
              placeholder="What would you like to do?"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="command-list">
              {actions
                .filter((a) =>
                  a.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((a) => (
                  <button
                    key={a.label}
                    onClick={() => {
                      setModal("");
                      void a.run();
                    }}
                  >
                    {a.label}
                    <kbd>{a.shortcut}</kbd>
                  </button>
                ))}
            </div>
          </div>
        </Modal>
      )}
      {modal === "templates" && (
        <Modal
          title="Start with a little structure"
          onClose={() => setModal("")}
        >
          <div className="modal-content">
            <p className="help">
              Replaces the current document. A recovery copy is saved first.
            </p>
            <div className="template-list">
              {Object.entries(templates).map(([name, source]) => (
                <button
                  key={name}
                  onClick={async () => {
                    try {
                      await saveChain.current;
                      version.current = await save(doc, version.current);
                      setDoc(d => ({ ...d, id: crypto.randomUUID(), source, assets: {}, revision: d.revision + 1 }));
                      setModal("");
                    } catch (e) {
                      setNotice(String(e));
                    }
                  }}
                >
                  <FileText size={24} />
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {name === "Blank document"
                        ? "A fresh page for your next idea."
                        : `${source.split("\n").length} lines · Ready to make your own`}
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {modal === "history" && (
        <Modal title="Local history" onClose={() => setModal("")}>
          <div className="modal-content">
            <p className="help">
              Up to 50 revisions per document, stored in this browser. Browser
              data can be cleared or evicted.
            </p>
            {!records.length && <p>No saved revisions yet.</p>}
            <div className="history-list">
              {records.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setDoc(structuredClone(r.snapshot));
                    setNotesRestoreKey(k => k+1);
                    setModal("");
                    setNotice(
                      "Document revision restored with its associated notes.",
                    );
                  }}
                >
                  <Clock size={16} />
                  <span>
                    {new Date(r.at).toLocaleString()}
                    <small>{r.snapshot.source.slice(0, 65)}</small>
                  </span>
                  <span>{r.snapshot.source.length} chars</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="Make it your workspace" onClose={() => setModal("")}>
          <div className="modal-content settings-content">
            <h3>Appearance</h3>
            <label>
              Interface theme
              <select
                value={prefs.theme}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    theme: e.target.value as Preferences["theme"],
                  }))
                }
              >
                <option value="system">Follow system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Document theme
              <select
                value={prefs.documentTheme}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    documentTheme: e.target.value as "light" | "dark",
                  }))
                }
              >
                <option value="light">Light paper</option>
                <option value="dark">Dark paper</option>
              </select>
            </label>
            {(
              [
                {
                  key: "fontSize",
                  label: "Font size",
                  min: 12,
                  max: 24,
                  step: 1,
                  unit: "px",
                },
                {
                  key: "lineHeight",
                  label: "Line height",
                  min: 1.3,
                  max: 2.4,
                  step: 0.1,
                  unit: "",
                },
                {
                  key: "width",
                  label: "Content width",
                  min: 480,
                  max: 1100,
                  step: 20,
                  unit: "px",
                },
                {
                  key: "zoom",
                  label: "Preview zoom",
                  min: 25,
                  max: 400,
                  step: 1,
                  unit: "%",
                },
              ] as const
            ).map((x) => (
              <label key={x.key}>
                {x.label}
                <span className="range-control">
                  <input
                    aria-label={x.label}
                    type="range"
                    min={x.min}
                    max={x.max}
                    step={x.step}
                    value={prefs[x.key]}
                    onChange={(e) =>
                      x.key === 'zoom' ? navigation.applyZoom(Number(e.target.value)) : setPrefs((p) => ({
                        ...p,
                        [x.key]: Number(e.target.value),
                      }))
                    }
                  />
                  <output>
                    {Number(prefs[x.key].toFixed(1))}
                    {x.unit}
                  </output>
                </span>
              </label>
            ))}
            <h3>Mathematics</h3>
            <label>
              Single-dollar inline math
              <input
                type="checkbox"
                checked={doc.settings.singleDollarMath}
                onChange={(e) =>
                  setDoc((d) => ({
                    ...d,
                    settings: {
                      ...d.settings,
                      singleDollarMath: e.target.checked,
                    },
                    revision: d.revision + 1,
                  }))
                }
              />
            </label>
            <p className="help">
              Escape currency as \$ or turn off inline dollar delimiters.
              Display math uses $$ on its own lines.
            </p>
            <label className="stacked">
              Document macros (JSON)
              <textarea
                aria-label="Document macros"
                value={macroText}
                onChange={(e) => setMacroText(e.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              onClick={() => {
                try {
                  const macros = JSON.parse(macroText);
                  if (
                    !macros ||
                    Array.isArray(macros) ||
                    typeof macros !== "object"
                  )
                    throw new Error("Use a JSON object.");
                  setDoc((d) => ({
                    ...d,
                    settings: { ...d.settings, macros },
                    revision: d.revision + 1,
                  }));
                  setNotice("Document macros applied.");
                } catch (e) {
                  setNotice(`Invalid macros: ${String(e)}`);
                }
              }}
            >
              Apply macros
            </button>
            <h3>Images & pasting</h3>
            <p className="help">
              Remote image fetching contacts the image host and stores the
              result locally. CORS restrictions may require uploading a copy.
            </p>
            <button className="secondary-button" onClick={fetchRemote}>
              Fetch remote images
            </button>
            <button
              className="secondary-button"
              onClick={() => setModal("paste")}
            >
              Convert HTML to Markdown…
            </button>
            <h3>Export service</h3>
            <p className="help">
              PDF, PNG and standalone HTML are processed at this app’s /api
              export service when requested. Source editing and storage stay on
              your device.
            </p>
            <label>
              Access token
              <input
                type="password"
                aria-label="Export access token"
                defaultValue={token()}
                onChange={(e) =>
                  sessionStorage.setItem("folio-export-token", e.target.value)
                }
                placeholder="Optional for local service"
              />
            </label>
          </div>
        </Modal>
      )}
      {modal === "image" && imageDraft && (
        <Modal title="Add an image" onClose={() => setModal("")}>
          <div className="modal-content">
            <img
              className="image-draft"
              src={imageDraft.asset.data}
              alt="Uploaded image preview"
            />
            <label className="stacked">
              Alternative text
              <input
                autoFocus
                value={imageDraft.alt}
                onChange={(e) =>
                  setImageDraft({ ...imageDraft, alt: e.target.value })
                }
                placeholder="Describe what the image communicates"
              />
            </label>
            <label className="stacked">
              Caption (optional)
              <input
                value={imageDraft.caption}
                onChange={(e) =>
                  setImageDraft({ ...imageDraft, caption: e.target.value })
                }
              />
            </label>
            <p className="help">
              Animated GIFs become a static frame in PDF and PNG.
            </p>
            <label>
              Figure width{" "}
              <span className="range-control">
                <input
                  aria-label="Figure width"
                  type="range"
                  min="25"
                  max="100"
                  step="5"
                  value={imageDraft.width}
                  onChange={(e) =>
                    setImageDraft({
                      ...imageDraft,
                      width: Number(e.target.value),
                    })
                  }
                />
                <output>{imageDraft.width}%</output>
              </span>
            </label>
            <button
              className="primary-button"
              onClick={() => {
                const { asset, alt, caption, width } = imageDraft;
                setDoc((d) => ({
                  ...d,
                  assets: { ...d.assets, [asset.path]: asset },
                  revision: d.revision + 1,
                }));
                const safeAlt = alt.replace(/[\[\]\\]/g, "");
                const md = `![${safeAlt}](${asset.path})`;
                insert(
                  caption || width !== 100
                    ? `\n:::figure{caption=${JSON.stringify(caption)} width="${width}"}\n${md}\n:::\n`
                    : `\n${md}\n`,
                );
                setModal("");
                setImageDraft(null);
              }}
            >
              Insert image
            </button>
          </div>
        </Modal>
      )}
      {modal === "paste" && (
        <Modal title="Convert HTML to Markdown" onClose={() => setModal("")}>
          <div className="modal-content">
            <p className="help">
              Paste HTML below. Review the converted source before inserting it.
              This operation is undoable.
            </p>
            <label className="stacked">
              HTML
              <textarea
                value={htmlText}
                onChange={(e) => setHtmlText(e.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              onClick={async () => {
                const [{ default: Turndown }, { default: DOMPurify }] =
                  await Promise.all([import("turndown"), import("dompurify")]);
                setConverted(
                  new Turndown().turndown(DOMPurify.sanitize(htmlText)),
                );
              }}
            >
              Convert
            </button>
            <label className="stacked">
              Markdown preview
              <textarea
                value={converted}
                onChange={(e) => setConverted(e.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={!converted}
              onClick={() => {
                insert(converted);
                setModal("");
              }}
            >
              Insert Markdown
            </button>
          </div>
        </Modal>
      )}
      {modal === "diagnostics" && (
        <Modal title="Document diagnostics" onClose={() => setModal("")}>
          <div className="modal-content">
            {!diagnostics.length ? (
              <p className="empty-state">
                <Check />
                No rendering issues detected in this document.
              </p>
            ) : (
              diagnostics.map((d, i) => (
                <button
                  className="diagnostic-item"
                  key={i}
                  onClick={() => {
                    navigate(
                      result?.blocks.find((b) => b.start === d.line)?.id || "",
                      d.line,
                    );
                    setModal("");
                  }}
                >
                  <AlertCircle size={17} />
                  <span>
                    <strong>
                      {d.code} · line {d.line}
                    </strong>
                    {d.message}
                  </span>
                </button>
              ))
            )}
            <p className="help">
              Export preflight checks fonts, images and printable bounds
              separately.
            </p>
          </div>
        </Modal>
      )}
      {modal === "support" && (
        <Modal title="Syntax & support" onClose={() => setModal("")} wide>
          <div className="modal-content support-content">
            <p>
              iLoveMd 0.1 is a working local-first workspace. Compatibility is
              bounded by the regression fixtures; it is not a universal LaTeX or
              HTML converter.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Boundary</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>CommonMark + GFM</td>
                  <td>
                    Lists, tasks, links, code, tables, footnotes. Raw HTML is
                    displayed as text.
                  </td>
                </tr>
                <tr>
                  <td>Math</td>
                  <td>
                    KaTeX subset, $ inline and $$ display, mhchem, restricted
                    macros. No full LaTeX packages.
                  </td>
                </tr>
                <tr>
                  <td>Columns</td>
                  <td>
                    Two flowing columns; single column on narrow screens. Nested
                    columns unsupported.
                  </td>
                </tr>
                <tr>
                  <td>Tables</td>
                  <td>
                    GFM cells, repeated print headers. No merged cells;
                    oversized content requires adjustment.
                  </td>
                </tr>
                <tr>
                  <td>Media</td>
                  <td>
                    Local raster images. Flowcharts and sequence diagrams. Video
                    links in static exports.
                  </td>
                </tr>
                <tr>
                  <td>Export</td>
                  <td>
                    PDF, PNG, HTML, Markdown, asset bundles. PDF/UA conformance
                    is not claimed.
                  </td>
                </tr>
                <tr>
                  <td>Roadmap</td>
                  <td>
                    Citations, automatic references, offline app shell, DOCX,
                    EPUB, JPEG/WebP.
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>Application extensions</h3>
            <pre>
              {
                ':::note\nA useful callout.\n:::\n\n:::columns\nFirst paragraph.\n\nSecond paragraph.\n:::\n\n::pagebreak\n\n:::figure{caption="A descriptive caption"}\n![Alternative text](assets/image.png)\n:::\n\n::video{url="https://youtu.be/VIDEO_ID" title="Video title"}\n\n::toc'
              }
            </pre>
            <p className="help">
              A working implementation, with bounded compatibility. Production validation is still in progress.
            </p>
            <details><summary>Feature support and verification boundaries</summary><table><thead><tr><th>Feature</th><th>Status</th><th>Boundary</th></tr></thead><tbody>{supportMatrix.features.map(feature=><tr key={feature.id}><td>{feature.id.replaceAll('-',' ')}</td><td>{feature.status.replaceAll('-',' ')}</td><td>{'limits' in feature?feature.limits:feature.acceptance}</td></tr>)}</tbody></table></details>
          </div>
        </Modal>
      )}
      {preservedNotes && notes.set && <Modal title="Preserved annotated revision" onClose={() => setPreservedNotes(false)}><div className="preserved-scroll"><p>Original revision {notes.set.revision}. Your current Markdown is unchanged.</p><button onClick={notes.backup}>Download editable notes backup</button><div className="preserved-page" style={{ position:'relative', width:notes.set.layout.width, '--annotation-columns': (notes.set.layout.mediaWidth ?? 1440) <= 650 ? 1 : 2 } as CSSProperties}><article className="document" data-theme={notes.set.layout.theme} style={{ width:notes.set.layout.width,padding:notes.set.layout.padding.map(x=>`${x}px`).join(' '),'--doc-font':`${notes.set.layout.fontSize}px`,'--doc-leading':notes.set.layout.lineHeight } as CSSProperties} dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(notes.set.previewHtml ?? '')}}/><div dangerouslySetInnerHTML={{__html:overlaySvg(notes.set)}}/></div></div></Modal>}
      {modal === "export" && (
        <Modal
          title="Ready to leave the page"
          onClose={() => {
            exportAbort.current?.abort();
            setModal("");
          }}
          wide
        >
          <div className="export-layout">
            <div className="export-settings">
              <p className="eyebrow">EXPORT DOCUMENT</p>
              <h3>Your work, beautifully portable.</h3>
              <p className="help">
                PDF, PNG and HTML use your configured export service. Markdown
                and bundles download directly from this device.
              </p>
              <div className="format-options">
                {(["pdf", "png", "html"] as const).map((format) => (
                  <button
                    key={format}
                    className={
                      exportOptions.format === format ? "selected" : ""
                    }
                    onClick={() => setExportOptions((o) => ({ ...o, format }))}
                  >
                    <FileText size={21} />
                    <strong>{format.toUpperCase()}</strong>
                    <small>
                      {format === "pdf"
                        ? "Print & share"
                        : format === "png"
                          ? "Capture & present"
                          : "Publish & archive"}
                    </small>
                  </button>
                ))}
              </div>
              <label>
                Export theme
                <select
                  value={exportOptions.theme}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      theme: e.target.value as "light" | "dark",
                    }))
                  }
                >
                  <option value="light">Light paper</option>
                  <option value="dark">Dark paper</option>
                </select>
              </label>
              <label>
                Page size
                <select
                  value={exportOptions.paper}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      paper: e.target.value as ExportOptions["paper"],
                    }))
                  }
                >
                  <option>A4</option>
                  <option>Letter</option>
                  <option>Legal</option>
                </select>
              </label>
              <label>
                Orientation
                <select
                  value={exportOptions.landscape ? "landscape" : "portrait"}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      landscape: e.target.value === "landscape",
                    }))
                  }
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label>
                Margins (mm)
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={exportOptions.margin}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      margin: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Scale
                <input
                  type="number"
                  min="0.25"
                  max="2"
                  step="0.25"
                  value={exportOptions.scale}
                  disabled={!!exportOptions.includeAnnotations && exportOptions.format === "pdf"}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      scale: Number(e.target.value),
                    }))
                  }
                />
              </label>
              {exportOptions.format === "png" && (
                <>
                  <label>
                    Capture
                    <select
                      value={exportOptions.pngMode}
                      onChange={(e) =>
                        setExportOptions((o) => ({
                          ...o,
                          pngMode: e.target.value as ExportOptions["pngMode"],
                        }))
                      }
                    >
                      <option value="document">Full document</option>
                      <option value="pages">PDF page images (ZIP)</option>
                      <option value="selection" disabled={!selectedBlock}>
                        Selected block
                      </option>
                    </select>
                  </label>
                  <label>
                    Width (px)
                    <input
                      type="number"
                      min="320"
                      max="4096"
                      value={exportOptions.width}
                      disabled={!!exportOptions.includeAnnotations}
                      onChange={(e) =>
                        setExportOptions((o) => ({
                          ...o,
                          width: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Background
                    <select
                      value={exportOptions.background}
                      onChange={(e) =>
                        setExportOptions((o) => ({
                          ...o,
                          background: e.target
                            .value as ExportOptions["background"],
                        }))
                      }
                    >
                      <option value="theme">Document theme</option>
                      <option value="transparent">
                        Transparent (document/block)
                      </option>
                    </select>
                  </label>
                </>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={exportOptions.allowWarnings}
                  onChange={(e) =>
                    setExportOptions((o) => ({
                      ...o,
                      allowWarnings: e.target.checked,
                    }))
                  }
                />
                Export with visible warnings if content needs attention
              </label>
              <label className="checkbox-label"><input type="checkbox" checked={!!exportOptions.includeAnnotations} disabled={!notes.set} onChange={e => setExportOptions(o => ({...o,includeAnnotations:e.target.checked}))}/>Include annotations</label>
              {exportOptions.includeAnnotations && <p className="help">Uses the preserved page width and typography. PDF fits this layout to the paper; page boundaries can split content. Video embeds remain static.</p>}
              {exportOptions.includeAnnotations && notes.stale && <label className="checkbox-label"><input type="checkbox" checked={exportPreserved} onChange={e=>setExportPreserved(e.target.checked)}/>Export the preserved annotated revision instead of current Markdown</label>}
              {exportError && (
                <p className="inline-error" role="alert">
                  {exportError}
                </p>
              )}
              {exportDiagnostics.map((d, i) => (
                <p className="export-warning" key={i}>
                  {d.code}: {d.message}
                </p>
              ))}
              <button
                className="primary-button full"
                onClick={generateExport}
                disabled={exporting}
              >
                {exporting ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Eye size={16} />
                )}{" "}
                {exporting
                  ? "Preparing your document…"
                  : "Generate export preview"}
              </button>
              {exporting && (
                <button
                  className="quiet-button"
                  onClick={() => exportAbort.current?.abort()}
                >
                  Cancel export
                </button>
              )}
              {artifact && exportResult && (
                <button
                  className="primary-button full"
                  onClick={() => {
                    download(artifact, exportResult.artifacts[0].name);
                    setNotice(
                      exportResult.warnings.length
                        ? "Downloaded with the listed warnings."
                        : "Export downloaded successfully.",
                    );
                  }}
                >
                  <Download size={16} />
                  Download {exportResult.artifacts[0].name}
                </button>
              )}
              <div className="source-downloads">
                <button
                  onClick={() =>
                    download(doc.source, "document.md", "text/markdown")
                  }
                >
                  <Code2 size={15} />
                  Markdown source
                </button>
                <button onClick={bundle}>
                  <FileArchive size={15} />
                  Source + assets
                </button>
              </div>
            </div>
            <div className="export-preview">
              {artifact &&
              exportResult?.artifacts[0].mime === "application/pdf" ? (
                <Suspense fallback={<p>Loading PDF preview…</p>}>
                  <PdfPreview blob={artifact} />
                </Suspense>
              ) : artifact ? (
                <div className="export-success">
                  <Check size={32} />
                  <h3>Export prepared</h3>
                  <p>{exportResult?.artifacts[0].name}</p>
                  <p>
                    {(artifact.size / 1024).toFixed(1)} KB ·{" "}
                    {exportResult?.warnings.length
                      ? "Review the warnings before downloading."
                      : "Ready to download."}
                  </p>
                </div>
              ) : (
                <div className="preview-empty">
                  <div className="paper-outline">
                    <AlignLeft size={36} />
                    <span />
                    <span />
                    <span />
                  </div>
                  <h3>A final look before you share.</h3>
                  <p>
                    Generate your export to check the result.
                    <br />
                    PDF previews show the actual exported pages.
                  </p>
                  <span className="privacy-note">
                    <ShieldCheck size={14} />
                    Temporary exports expire after 10 minutes.
                  </span>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
