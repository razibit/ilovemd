import DOMPurify from "dompurify";
let counter = 0;
export async function renderDiagrams(root: HTMLElement) {
  const errors: string[] = [];
  const nodes = [...root.querySelectorAll<HTMLElement>("code.mermaid-source")];
  if (!nodes.length) return errors;
  const { default: mermaid } = await import("mermaid");
  // Mermaid measures labels during layout. Wait for bundled fonts so those
  // metrics match the CSS applied to the serialized SVG in preview and export.
  await document.fonts.load('400 14px "DM Sans"');
  if (document.fonts?.ready) await document.fonts.ready;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    themeVariables: { fontFamily: '"DM Sans", sans-serif', fontSize: "14px" },
    htmlLabels:false,
    maxTextSize: 30000,
    flowchart: { htmlLabels: false },
    suppressErrorRendering: true,
  });
  for (const node of nodes) {
    try {
      if ((node.textContent?.length ?? 0) > 30000)
        throw new Error("Diagram exceeds 30,000 characters.");
      const { svg } = await mermaid.render(
        `diagram-${counter++}`,
        node.textContent ?? "",
      );
      const figure = document.createElement("div");
      figure.className = "diagram";
      // Mermaid emits width="100%". That stretches tall/narrow diagrams to the
      // full paper width and turns a modest flowchart into a multi-page column.
      // Let the shared document CSS size the SVG from its viewBox instead.
      // Preserve layout-critical presentation before stripping inline CSS.
      // Mermaid positions SVG text relative to its text-anchor; dropping that
      // changes centered labels to start-aligned labels without moving nodes.
      const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
      const presentation = ["text-anchor", "dominant-baseline", "alignment-baseline", "font-size", "font-weight", "font-style"];
      const transfer = (element: Element, style: CSSStyleDeclaration) => {
        for (const name of presentation) {
          const value = style.getPropertyValue(name);
          if (value && /^[a-zA-Z0-9. %+-]+$/.test(value)) element.setAttribute(name, value);
        }
      };
      // Parse styles without attaching them to the live document. Only these
      // inert presentation attributes survive; arbitrary CSS is still removed.
      for (const style of parsed.querySelectorAll("style")) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(style.textContent ?? "");
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue;
          for (const element of parsed.querySelectorAll(rule.selectorText)) transfer(element, rule.style);
        }
      }
      for (const element of parsed.querySelectorAll<SVGElement>("[style]")) {
        transfer(element, element.style);
      }
      parsed.documentElement.removeAttribute("width");
      parsed.documentElement.setAttribute("font-size", "14px");
      parsed.documentElement.setAttribute("font-weight", "400");
      const intrinsicSvg = new XMLSerializer().serializeToString(parsed.documentElement);
      figure.innerHTML = DOMPurify.sanitize(intrinsicSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ["foreignObject", "script", "a", "style"],
        FORBID_ATTR: ["style"],
      });
      for (const element of figure.querySelectorAll("*"))
        for (const attr of [...element.attributes]) {
          if (
            (/href$/i.test(attr.name) && !attr.value.startsWith("#")) ||
            (/url\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value))
          )
            element.removeAttribute(attr.name);
        }
      const parent = node.closest("pre")!;
      figure.id = parent.id;
      for (const [key, value] of Object.entries(parent.dataset))
        figure.dataset[key] = value;
      parent.replaceWith(figure);
      (figure as any).folioSource = (parent as any).folioSource;
    } catch (e) {
      node.className = "render-error";
      errors.push(`Diagram: ${String(e)}`);
    }
  }
  return errors;
}
