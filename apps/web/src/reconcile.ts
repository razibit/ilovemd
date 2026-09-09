/** Preserve unchanged rendered blocks, including decoded images and SVG diagrams. */
export function reconcileDocument(root: HTMLElement, html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const incoming = [...template.content.childNodes];
  type Tracked = Node & { folioSource?: string };
  for (let i = 0; i < incoming.length; i++) {
    const next = incoming[i] as Tracked;
    const signature =
      next instanceof Element ? next.outerHTML : (next.textContent ?? "");
    const current = root.childNodes[i] as Tracked | undefined;
    if (current?.folioSource === signature) continue;
    next.folioSource = signature;
    if (current) root.replaceChild(next, current);
    else root.append(next);
  }
  while (root.childNodes.length > incoming.length) root.lastChild?.remove();
}
