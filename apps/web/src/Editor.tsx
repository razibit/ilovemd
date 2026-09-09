import { useEffect, useRef } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
const highlighting = (dark: boolean) =>
  syntaxHighlighting(
    HighlightStyle.define([
      {
        tag: tags.heading,
        color: dark ? "#d4e8c9" : "#2e583c",
        fontWeight: "bold",
      },
      {
        tag: tags.link,
        color: dark ? "#afd0f0" : "#295676",
        textDecoration: "underline",
      },
      { tag: tags.url, color: dark ? "#afd0f0" : "#295676" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.monospace, color: dark ? "#d8c3ef" : "#68467e" },
      { tag: tags.processingInstruction, color: dark ? "#c3cabf" : "#606d62" },
      { tag: tags.quote, color: dark ? "#c3cabf" : "#606d62" },
    ]),
  );
export function Editor({
  source,
  onChange,
  onReady,
  onScroll,
  onPasteImage,
  dark,
}: {
  source: string;
  onChange: (s: string) => void;
  onReady: (v: EditorView) => void;
  onScroll: () => void;
  onPasteImage: (f: File) => void;
  dark: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    callbacks = useRef({ onChange, onScroll, onPasteImage });
  callbacks.current = { onChange, onScroll, onPasteImage };
  const theme = useRef(new Compartment());
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          history(),
          markdown(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          theme.current.of([
            EditorView.theme({}, { dark }),
            highlighting(dark),
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Markdown source",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            scroll: () => {
              callbacks.current.onScroll();
              return false;
            },
            paste: (e) => {
              const file = [...(e.clipboardData?.files ?? [])].find((f) =>
                f.type.startsWith("image/"),
              );
              if (file) {
                e.preventDefault();
                callbacks.current.onPasteImage(file);
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    view.current = v;
    onReady(v);
    return () => v.destroy();
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== source)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: source },
      });
  }, [source]);
  useEffect(() => {
    view.current?.dispatch({
      effects: theme.current.reconfigure([
        EditorView.theme({}, { dark }),
        highlighting(dark),
      ]),
    });
  }, [dark]);
  useEffect(() => {
    if (view.current) {
      view.current.scrollDOM.tabIndex = 0;
      view.current.scrollDOM.setAttribute(
        "aria-label",
        "Scrollable Markdown editor",
      );
    }
  }, []);
  return <div className="editor-host" ref={host} />;
}
