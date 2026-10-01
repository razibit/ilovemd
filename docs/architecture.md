# Architecture and decisions

## Source of truth

The original Markdown string is never reformatted by rendering. Positioned mdast nodes become sanitized hast nodes; application-owned transforms then add restricted KaTeX HTML/MathML, Shiki markup, accessible citation markers/references, and sanitized Mermaid SVG. The engine returns HTML, a block map, outline, diagnostics and an asset requirement list. Both browser preview and browser export call this same engine.

The browser worker is cancelled and recreated when an in-flight render is superseded, and terminated after ten seconds. Revision checks reject stale results. Server parsing runs in a worker with a 256 MiB old-generation limit and ten-second timeout. Math expansion and expression lengths are bounded. Parser failures preserve source and show the previous valid preview with a diagnostic.

CodeMirror state remains mounted through view changes. Scroll mapping uses measured block anchors and interpolation, including freshly measured DOM positions after content changes. An ownership guard prevents feedback loops. Nested source blocks and columns can introduce non-monotonic visual positions, so exact one-line alignment across every layout is not claimed.

IndexedDB schema v4 stores document metadata and workspace selection separately from document heads, revision history, annotations and shared content-addressed assets. Heads and optimistic save queues belong to document IDs. Only the active editor and preview are mounted; the sidebar virtualizes its metadata list. Clean inactive snapshots are evicted from memory, while failed saves retain recoverable drafts. Each document owns its title, reading preferences, export options, drawing settings and scroll positions; interface appearance is global.

The atomic upgrade retains the authoritative legacy `current` head, recovers the latest valid history for other IDs and recovers orphan annotation snapshots. Existing IDs, history, notes and assets remain intact, including damaged originals for recovery. An interrupted upgrade rolls back and retries on the next open. History retention is 50 revisions per document. Conflicting saves retain a recovery copy without overwriting the head. Deletion tombstones prevent late or competing-tab saves from resurrecting a deleted document. Shared asset garbage collection is deferred.

## Export contract

The export dialog dynamically loads the browser exporter. It renders the selected immutable snapshot into an off-screen document, resolves diagrams, fonts and local images, and returns a Blob held only by the current tab. Revision checks reject an artifact if the document changes while it is generated. Cancellation and a sixty-second deadline use one abort signal, and a failed attempt leaves the dialog ready to retry.

Markdown and the sibling SVG overlay share one relatively positioned document surface. Coordinates are unscaled CSS pixels from the document border box; inverse SVG screen matrices convert pointer input. Zoom and pan transform the entire surface. Versioned layout metadata freezes dimensions, padding, borders, typography and column flow. Export captures the matching immutable document ID/revision and verifies recorded block geometry after fonts, images and diagrams settle.

PDF uses a local `dom-to-svg` adapter and pdfmake SVG pages instead of independent HTML reflow. Browser-measured word runs preserve positions, baselines and inline whitespace. Compatible fonts are embedded; ordinary text and strokes remain vector content. Unsupported regions (including code, faux emphasis, list markers and complex shaping) are captured locally at a minimum effective 300 DPI, with imperceptible selectable text retained underneath. A single measured pagination plan serves PDF and page PNG, keeps headings with following content, repeats table headers and clips crossing strokes onto both pages. Enabling annotations changes only the overlay.

PNG captures or crops the shared surface at its frozen annotated width; clean document/block captures retain their explicit width control. Export resolution changes pixel density only. Page images use full paper dimensions and the PDF margin/scale transform, including transparent backgrounds when selected. Oversized full-document captures fall back to sequentially rendered page images in a ZIP. Standalone HTML embeds document styles, fonts and local assets and serializes the sized relative container and overlay together, so both scroll as one document. No remote browser process is required. Current browser limits remain 32 megapixels per canvas, 200 pages and a 60-second operation deadline.

The Cloudflare Worker serves only static application assets. There is no production export API, secret, origin, container, browser binding, retained server artifact, or document upload. The Node/Playwright renderer remains solely as an optional reference implementation for comparison tests.

## Research basis and browser adapter references

- [remark](https://github.com/remarkjs/remark) provides CommonMark parsing and positioned syntax trees. It fits source mapping and extensions more directly than a token-to-HTML-only integration.
- [markdown-it](https://github.com/markdown-it/markdown-it) remains a credible simpler parser; it is not combined with remark.
- [CodeMirror repository migration](https://github.com/codemirror/dev) explains the archived GitHub repository. Packages continue to be published; archival alone was not treated as abandonment.
- [KaTeX options](https://katex.org/docs/options) document HTML/MathML output, macro limits and trust restrictions. [MathJax accessibility](https://docs.mathjax.org/en/latest/basic/accessibility.html) motivates revisiting richer math exploration later.
- [rehype-sanitize](https://github.com/rehypejs/rehype-sanitize) documents transform ordering. Raw user HTML is escaped here, and controlled math/highlighting is added after sanitization.
- [pdfmake SVG support](https://pdfmake.github.io/docs/0.1/document-definition-object/svgs/) packages measured browser SVG into directly downloadable pages. `dom-to-svg` is isolated behind the local adapter; its whitespace serialization is replaced with measured text runs.
- [html2canvas](https://html2canvas.hertzen.com/) renders the supported document DOM without a server process; its CSS support boundary is treated as an export compatibility limit.
- [Paged.js](https://github.com/pagedjs/pagedjs) was not added: the shared measured pagination plan avoids a second document layout layer.
- [WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/) adds another layout engine; [Pandoc](https://pandoc.org/MANUAL.html) is reserved for potential DOCX/EPUB adapters with separate fidelity testing.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) guides contrast, focus, keyboard and reflow testing. Palette choices are not claimed to suit every reader.

Versions and transitive license identifiers are recorded in `dependencies.json` and `package-lock.json`. Three initial audit findings in PDF.js, sharp and Fastify static were resolved through patched versions. A clean package audit is not a security certification.
