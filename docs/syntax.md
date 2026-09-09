# Supported syntax and output policies

Baseline: CommonMark 0.31.2 with GFM tables, task lists, strikethrough, autolinks and footnotes. Raw HTML is displayed as escaped source with a warning. It is not silently removed. Code examples never execute.

### Escaped newlines in imported tables

Some table generators serialize a cell line break as literal `\n`. iLoveMd renders a single unescaped sequence in table prose as a hard line break, while preserving the underlying source. Inline code and doubled backslashes remain literal. Ordinary LF/CRLF follows Markdown soft/hard-break rules.

## Mathematics

Inline: `$E=mc^2$`. Display: put `$$` on separate lines around the expression. The single-dollar option can be disabled to avoid currency ambiguity; escape literal currency as `\$`. Code spans and fences do not parse mathematics. `\(...\)` and `\[...\]` delimiters are not implemented.

KaTeX supports the tested fractions, roots, scripts, matrices, aligned equations, cases, sums, integrals, scientific notation and explicit `\tag{1}`. The mhchem extension supports expressions such as `\ce{2H2 + O2 -> 2H2O}`. `\mathrm{m\,s^{-1}}` is usable for units; unrestricted siunitx and complete LaTeX documents are unsupported. Automatic numbering, `\label`/`\ref`, bibliography processing and citation styles are planned.

Settings accepts document-local macro JSON, for example `{"\\R":"\\mathbb{R}"}`. At most 100 named macros, 2,000 characters per macro, 20,000 characters per expression and 1,000 expansion steps. Trust is disabled and layout sizes are capped. Unknown commands remain visible with a source-linked error.

## Directives

```markdown
:::note
**Note:** Context that helps the reader.
:::

:::columns

### First idea

Paragraph one.

### Second idea

Paragraph two.
:::

::pagebreak

:::figure{caption="A descriptive caption" width="75"}
![Descriptive alternative text](assets/image.png)
:::

::video{url="https://youtu.be/abcdef12345" title="Video title"}

::toc
```

`tip` and `warning` are also callout names. Figure width is 25–100 percent. Columns flow in document order and collapse below 650 CSS pixels on screen. PDF preserves two-column flow. Nested columns, row-aligned independent columns and arbitrary HTML/CSS layouts are unsupported.

Tables have ordinary GFM cells and inline math; merged cells are unsupported. On screen wide content can require scrolling. Print wraps ordinary cell text, repeats headers and keeps rows together when possible. Oversized detected content requires orientation, margin or scale changes, or an explicit warning export. Do not assume every pathological table can be paginated.

Mermaid fences support flowcharts, sequence, class, state, ER, journey, Gantt, pie, mindmap, timeline, quadrant, git, XY, Sankey, block, and architecture diagrams. Scripted interactions, external links and custom configuration are restricted; generated SVG is sanitized and constrained by document CSS. Videos load only after the user clicks a provider button; PDF/PNG/HTML retain a link. Poster-image selection is not yet implemented.

## Formats

| Format             | Behavior                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF                | Searchable ordinary text, links, embedded fonts, raster images and vector content where Chromium supports it. Tags/outline enabled; not PDF/UA certified. |
| PNG document       | Width and scale controls; transparent or themed background. Limit 32 MP and 16,384 px per dimension; oversized documents become page-image ZIPs.          |
| PNG pages          | Rasterized actual PDF pages in a ZIP; maximum 200 pages. Page backgrounds follow the export theme.                                                        |
| PNG selected block | Click a rendered block, choose selected block capture. Selection is a whole source-mapped block, not a freehand crop.                                     |
| HTML               | Self-contained styles, embedded fonts/assets, static sanitized diagrams. No JavaScript runtime or interactive video.                                      |
| Markdown           | Exact current source string encoded as UTF-8.                                                                                                             |
| iLoveMd bundle (`.folio.zip`) | Exact source, settings, asset manifest and images. The legacy extension is retained for compatibility; this is not a universally portable ZIP layout. |

PNG/JPEG/WebP/GIF uploads are decoded and size checked. SVG uploads are parsed and sanitized: scripts, event handlers, foreign objects, styles, external references and CSS URLs are removed. GIFs become a static frame in static exports; animated standalone HTML images may remain animated. HEIC, audio, arbitrary iframes, whole-document SVG, DOCX, EPUB and PDF import are unsupported in this release. JPEG/WebP output, richer offline support and additional adapters are planned.
