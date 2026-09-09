import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import katex from "katex";
import "katex/contrib/mhchem";
import type { DocumentSnapshot, RenderResult, Diagnostic } from "./types";
export * from "./types";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const plain = (node: any): string =>
  node.value ?? (node.children ?? []).map(plain).join("");
const safeUrl = (url: string) =>
  /^(https?:|mailto:|#)/i.test(url) ||
  (!/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith("//"));
const blocks = new Set([
  "heading",
  "paragraph",
  "blockquote",
  "list",
  "listItem",
  "code",
  "table",
  "math",
  "containerDirective",
  "leafDirective",
  "thematicBreak",
]);
const mathCache = new Map<string, string>();
export async function renderDocument(
  snapshot: DocumentSnapshot,
): Promise<RenderResult> {
  if (new TextEncoder().encode(snapshot.source).length > 2 * 1024 * 1024)
    throw new Error(
      "Document exceeds the 2 MiB rendering limit. Your source is preserved.",
    );
  const result: RenderResult = {
    html: "",
    blocks: [],
    outline: [],
    diagnostics: [],
    resources: [],
  };
  const warn = (
    node: any,
    code: string,
    message: string,
    severity: Diagnostic["severity"] = "warning",
  ) =>
    result.diagnostics.push({
      code,
      message,
      severity,
      line: node.position?.start.line ?? 1,
    });
  const math = new Map<
    string,
    { value: string; display: boolean; line: number }
  >();
  let index = 0;
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, {
      singleDollarTextMath: snapshot.settings.singleDollarMath,
    })
    .use(remarkDirective);
  const tree: any = processor.parse(snapshot.source);
  // Imported table generators commonly serialize visual cell line breaks as
  // literal `\n`. Reparse each affected cell's inline Markdown after turning
  // only unescaped prose separators into Markdown hard breaks. This preserves
  // source, code spans and doubled backslashes, while letting GFM build links.
  visit(tree, "tableCell", (cell: any) => {
    const rawCell = snapshot.source.slice(
      cell.position?.start.offset,
      cell.position?.end.offset,
    );
    let delimiter = 0;
    let normalized = "";
    for (let i = 0; i < rawCell.length; i += 1) {
      if (rawCell[i] === "`") {
        let end = i;
        while (rawCell[end] === "`") end += 1;
        const run = end - i;
        if (!delimiter || delimiter === run) delimiter = delimiter ? 0 : run;
        normalized += rawCell.slice(i, end);
        i = end - 1;
      } else if (
        !delimiter && rawCell[i] === "\\" && rawCell[i + 1] === "n" &&
        rawCell[i - 1] !== "\\"
      ) {
        normalized += "  \n";
        i += 1;
      } else normalized += rawCell[i];
    }
    if (normalized !== rawCell) {
      const parsed: any = processor.parse(normalized);
      if (parsed.children.length === 1 && parsed.children[0].type === "paragraph")
        cell.children = parsed.children[0].children;
    }
  });
  visit(tree, (node: any) => {
    if (node.type === "html") {
      warn(
        node,
        "HTML_ESCAPED",
        "Raw HTML is displayed as source. Use Markdown or documented directives.",
      );
      node.type = "text";
    }
    if (node.type === "link" && !safeUrl(node.url)) {
      warn(node, "UNSAFE_URL", "Unsafe link was disabled.");
      node.url = "";
    }
    if (blocks.has(node.type)) {
      const id = `block-${index++}`;
      const start = node.position?.start.line ?? 1;
      const end = node.position?.end.line ?? start;
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          id,
          dataSourceStart: start,
          dataSourceEnd: end,
        },
      };
      result.blocks.push({ id, start, end });
      if (node.type === "heading")
        result.outline.push({
          id,
          text: plain(node),
          level: node.depth,
          line: start,
        });
    }
    if (node.type === "math" || node.type === "inlineMath") {
      const key = `math-${math.size}`;
      math.set(key, {
        value: node.value,
        display: node.type === "math",
        line: node.position?.start.line ?? 1,
      });
      node.data = {
        ...node.data,
        hName: node.type === "math" ? "div" : "span",
        hProperties: { ...node.data?.hProperties, dataMathKey: key },
        hChildren: [{ type: "text", value: node.value }],
      };
    }
    if (node.type === "image") {
      result.resources.push(node.url);
      const asset = snapshot.assets[node.url];
      if (asset && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(asset.data))
        node.url = asset.data;
      else if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(node.url)) {
      } else {
        warn(
          node,
          "MISSING_ASSET",
          `Image unavailable: ${node.url}. Upload it or explicitly fetch remote images.`,
          "error",
        );
        node.type = "text";
        node.value = `[Image unavailable: ${node.alt || node.url}]`;
      }
    }
  });
  const citations: { keys: string[]; index: number }[] = [];
  const transformCitations = (parent: any) => {
    if (!Array.isArray(parent.children) || parent.type === "code" || parent.type === "inlineCode") return;
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const node = parent.children[i];
      if (node.type === "text") {
        const marker = /cite([^]+)/g;
        const children: any[] = [];
        let cursor = 0;
        let match: RegExpExecArray | null;
        while ((match = marker.exec(node.value))) {
          if (match.index > cursor) children.push({ type: "text", value: node.value.slice(cursor, match.index) });
          const keys = match[1].split("").map((key: string) => key.trim()).filter(Boolean);
          const citation = { keys, index: citations.length + 1 };
          citations.push(citation);
          children.push({ type: "citation", keys, index: citation.index });
          cursor = match.index + match[0].length;
        }
        if (children.length) {
          if (cursor < node.value.length) children.push({ type: "text", value: node.value.slice(cursor) });
          parent.children.splice(i, 1, ...children);
        }
      } else transformCitations(node);
    }
  };
  transformCitations(tree);
  if (citations.length) {
    const line = snapshot.source.split("\n").length;
    tree.children.push({ type: "heading", depth: 2, children: [{ type: "text", value: "References" }], position: { start: { line }, end: { line } } });
    tree.children.push({ type: "list", ordered: true, children: citations.map((citation) => ({ type: "listItem", children: [{ type: "paragraph", children: [{ type: "text", value: citation.keys.join(" · ") }] }] })) });
  }
  visit(tree, (node: any, _i: any, parents: any) => {
    if (
      !["containerDirective", "leafDirective", "textDirective"].includes(
        node.type,
      )
    )
      return;
    const attrs = node.attributes ?? {};
    const names: Record<string, string> = {
      columns: "section",
      note: "aside",
      tip: "aside",
      warning: "aside",
      figure: "figure",
      pagebreak: "div",
      video: "p",
      toc: "nav",
    };
    if (!names[node.name]) {
      warn(
        node,
        "UNKNOWN_DIRECTIVE",
        `Unsupported directive “${node.name}”; its contents are retained.`,
      );
      node.data = { ...node.data, hName: "div" };
      return;
    }
    node.data = {
      ...node.data,
      hName: names[node.name],
      hProperties: {
        ...node.data?.hProperties,
        className: [`folio-${node.name}`],
      },
    };
    if (node.name === "columns" && parents?.name === "columns")
      warn(
        node,
        "NESTED_COLUMNS",
        "Nested columns are not supported. Flatten the nested section.",
        "error",
      );
    if (node.name === "figure" && attrs.width) {
      const width = Number(attrs.width);
      if (Number.isFinite(width) && width >= 25 && width <= 100)
        node.data.hProperties.dataFigureWidth = width;
      else
        warn(
          node,
          "FIGURE_WIDTH",
          "Figure width must be between 25 and 100 percent.",
        );
    }
    if (node.name === "figure" && attrs.caption)
      node.children.push({
        type: "paragraph",
        children: [{ type: "text", value: attrs.caption }],
        data: { hName: "figcaption" },
      });
    if (node.name === "video") {
      const url = attrs.url || "";
      const valid =
        /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[\w?=&/-]+$/.test(
          url,
        );
      node.children = [
        { type: "text", value: "Video · " },
        valid
          ? {
              type: "link",
              url,
              children: [{ type: "text", value: attrs.title || url }],
            }
          : { type: "text", value: attrs.title || url || "Missing video URL" },
      ];
      if (valid) node.data.hProperties["dataVideoUrl"] = url;
      else warn(node, "VIDEO_URL", "Use a YouTube or Vimeo HTTPS video URL.");
    }
    if (node.name === "toc")
      node.children = result.outline.map((h) => ({
        type: "paragraph",
        children: [
          {
            type: "link",
            url: `#${h.id}`,
            children: [{ type: "text", value: h.text }],
          },
        ],
      }));
  });
  const schema: any = {
    ...defaultSchema,
    clobberPrefix: "",
    attributes: {
      ...defaultSchema.attributes,
      "*": [
        ...(defaultSchema.attributes?.["*"] ?? []),
        "id",
        "className",
        "dataSourceStart",
        "dataSourceEnd",
        "dataMathKey",
        "dataVideoUrl",
        "dataFigureWidth",
        "dataCitation",
        "ariaLabel",
      ],
      code: [
        ...(defaultSchema.attributes?.code ?? []),
        ["className", /^language-/],
      ],
    },
    protocols: { ...defaultSchema.protocols, src: ["http", "https", "data"] },
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      "figure",
      "figcaption",
      "section",
      "aside",
      "nav",
    ],
  };
  for (const tag of ["section", "div", "span", "aside", "figure", "p"])
    schema.attributes[tag] = [
      ...(schema.attributes[tag] ?? []).filter(
        (v: any) => !(Array.isArray(v) && v[0] === "className"),
      ),
      "className",
    ];
  const bridge: any = unified();
  bridge.use(remarkRehype as any, {
    handlers: {
      citation(state: any, node: any) {
        return {
          type: "element",
          tagName: "sup",
          properties: {
            className: ["citation"],
            ariaLabel: `Citation ${node.index}: ${node.keys.join(", ")}`,
            dataCitation: node.keys.join(" "),
          },
          children: [{ type: "text", value: `[${node.index}]` }],
        };
      },
    },
  });
  bridge.use(rehypeSanitize, schema);
  const hast: any = await bridge.run(tree);
  const tasks: Promise<void>[] = [];
  visit(hast, "element", (node: any, _index: any, parent: any) => {
    if (node.properties.dataFigureWidth) {
      node.properties.style = `width:${Number(node.properties.dataFigureWidth)}%;margin-left:auto;margin-right:auto`;
      delete node.properties.dataFigureWidth;
    }
    if (node.tagName === "input" && node.properties.type === "checkbox")
      node.properties.ariaLabel = plain(parent).trim() || "Task item";
    const entry = math.get(node.properties?.dataMathKey);
    if (entry) {
      try {
        if (entry.value.length > 20000)
          throw new Error("Expression exceeds 20,000 characters.");
        const macros = snapshot.settings.macros ?? {};
        if (
          Object.keys(macros).length > 100 ||
          Object.entries(macros).some(
            ([k, v]) =>
              !/^\\[a-zA-Z]+$/.test(k) ||
              typeof v !== "string" ||
              v.length > 2000,
          )
        )
          throw new Error(
            "Use at most 100 named macros, each under 2,000 characters.",
          );
        const options = {
          displayMode: entry.display,
          output: "htmlAndMathml" as const,
          trust: false,
          maxExpand: 1000,
          maxSize: 20,
          throwOnError: true,
          strict: "warn" as const,
          macros: { ...macros },
        };
        const cacheKey = JSON.stringify([entry.value, options]);
        let renderedMath = mathCache.get(cacheKey);
        if (!renderedMath) {
          renderedMath = katex.renderToString(entry.value, options);
          if (mathCache.size >= 2000) mathCache.clear();
          mathCache.set(cacheKey, renderedMath);
        }
        node.children = [
          {
            type: "raw",
            value: renderedMath,
          },
        ];
        node.properties.className = [
          entry.display ? "math-display" : "math-inline",
        ];
      } catch (e) {
        node.properties.className = ["render-error"];
        node.children = [{ type: "text", value: entry.value }];
        result.diagnostics.push({
          severity: "error",
          code: "MATH_ERROR",
          line: entry.line,
          message: String(e),
        });
      }
      delete node.properties.dataMathKey;
    }
    if (node.tagName === "a" && /^https?:/.test(node.properties.href ?? ""))
      node.properties.rel = ["noopener", "noreferrer"];
    if (node.tagName === "code") {
      const language = (node.properties.className ?? [])
        .find((x: string) => x.startsWith("language-"))
        ?.slice(9);
      if (!language) return;
      const value = plain(node);
      if (language === "mermaid") {
        if (
          !/^\s*(graph\s|flowchart\s|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b|journey\b|gantt\b|pie\b|mindmap\b|timeline\b|quadrantChart\b|gitGraph\b|xychart-beta\b|sankey-beta\b|block-beta\b|architecture-beta\b)/.test(value) ||
          /%%\s*\{init|%%\s*\{config/.test(value)
        ) {
          result.diagnostics.push({
            severity: "error",
            code: "DIAGRAM_UNSUPPORTED",
            line: 1,
            message:
              "This Mermaid family is unsupported. Use a flowchart, sequence, class, state, ER, journey, Gantt, pie, mindmap, timeline, quadrant, git, XY, Sankey, block, or architecture diagram without configuration directives.",
          });
          return;
        }
        node.properties.className = ["mermaid-source"];
        if (parent?.tagName === "pre") {
          parent.properties = {
            ...parent.properties,
            ...node.properties,
            className: ["diagram-container"],
          };
          delete node.properties.id;
          delete node.properties.dataSourceStart;
          delete node.properties.dataSourceEnd;
        }
        return;
      }
      tasks.push(
        (async () => {
          try {
            const { codeToHtml } = await import("shiki");
            const html = await codeToHtml(value, {
              lang: language as any,
              themes: { light: "github-light", dark: "github-dark" },
              defaultColor: false,
            });
            node.properties.className = [
              ...(node.properties.className ?? []),
              "shiki",
            ];
            node.children = [
              {
                type: "raw",
                value: html
                  .replace(/^<pre[^>]*><code>/, "")
                  .replace(/<\/code><\/pre>$/, ""),
              },
            ];
          } catch {
            result.diagnostics.push({
              severity: "warning",
              code: "CODE_LANGUAGE",
              line: 1,
              message: `“${language}” is shown as plain code; highlighting is unavailable.`,
            });
          }
        })(),
      );
    }
  });
  await Promise.all(tasks);
  result.html = unified()
    .use(rehypeStringify, { allowDangerousHtml: true })
    .stringify(hast);
  return result;
}
