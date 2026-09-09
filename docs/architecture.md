# Architecture and decisions

## Source of truth

The original Markdown string is never reformatted by rendering. Positioned mdast nodes become sanitized hast nodes; application-owned transforms then add restricted KaTeX HTML/MathML, Shiki markup, accessible citation markers/references, and sanitized Mermaid SVG. The engine returns HTML, a block map, outline, diagnostics and an asset requirement list. Both browser preview and server export call this same engine. CSS supplies the intentional difference between continuous and paginated layout.

The browser worker is cancelled and recreated when an in-flight render is superseded, and terminated after ten seconds. Revision checks reject stale results. Server parsing runs in a worker with a 256 MiB old-generation limit and ten-second timeout. Math expansion and expression lengths are bounded. Parser failures preserve source and show the previous valid preview with a diagnostic.

CodeMirror state remains mounted through view changes. Scroll mapping uses measured block anchors and interpolation, including freshly measured DOM positions after content changes. An ownership guard prevents feedback loops. Nested source blocks and columns can introduce non-monotonic visual positions, so exact one-line alignment across every layout is not claimed.

IndexedDB schema v2 separates content-addressed image data from revision snapshots. Older v1 snapshots remain readable. Saves use atomic head/history transactions with expected-version conflict checks. A conflicting save records a recovery copy without overwriting the current head. Asset garbage collection is deferred; old unreferenced assets may consume storage until site data is cleared.

## Export contract

`POST /api/exports` accepts `{snapshot, options}` and returns a revision-bound artifact manifest, job ID, random access token and diagnostics. `GET /api/exports/:id/:index` requires `X-Export-Token`; `DELETE /api/exports/:id` releases the in-memory artifacts. TTL is ten minutes. The browser fetches the artifact into a Blob and releases its server copy; PDF.js previews that same Blob.

Document source and assets are sent only for explicitly requested service exports. No arbitrary HTML is accepted as a render API input. Browser contexts intercept every request and allow only bundled resources at a synthetic internal origin. Remote images must first be fetched explicitly by the user's browser or uploaded. This avoids a server-side arbitrary-URL proxy.

Two simultaneous exports are admitted; excess requests receive a clear 429 response instead of entering an unbounded queue. Maximum 20 retained jobs. Full OS process isolation, per-tenant quotas and host-level egress restrictions remain deployment responsibilities.

## Research basis (September 8, 2026)

- [remark](https://github.com/remarkjs/remark) provides CommonMark parsing and positioned syntax trees. It fits source mapping and extensions more directly than a token-to-HTML-only integration.
- [markdown-it](https://github.com/markdown-it/markdown-it) remains a credible simpler parser; it is not combined with remark.
- [CodeMirror repository migration](https://github.com/codemirror/dev) explains the archived GitHub repository. Packages continue to be published; archival alone was not treated as abandonment.
- [KaTeX options](https://katex.org/docs/options) document HTML/MathML output, macro limits and trust restrictions. [MathJax accessibility](https://docs.mathjax.org/en/latest/basic/accessibility.html) motivates revisiting richer math exploration later.
- [rehype-sanitize](https://github.com/rehypejs/rehype-sanitize) documents transform ordering. Raw user HTML is escaped here, and controlled math/highlighting is added after sanitization.
- [Playwright PDF options](https://playwright.dev/docs/api/class-page) support tagged PDFs and outlines but do not guarantee accessible reading order or universal pagination.
- [Paged.js](https://github.com/pagedjs/pagedjs) was not added: native Chromium pagination avoids a second layout layer. Registry release 0.4.3 dates to July 2023; later adoption needs a separate maintenance and fidelity review.
- [WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/) adds another layout engine; [Pandoc](https://pandoc.org/MANUAL.html) is reserved for potential DOCX/EPUB adapters with separate fidelity testing.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) guides contrast, focus, keyboard and reflow testing. Palette choices are not claimed to suit every reader.

Versions and transitive license identifiers are recorded in `dependencies.json` and `package-lock.json`. Three initial audit findings in PDF.js, sharp and Fastify static were resolved through patched versions. A clean package audit is not a security certification.
