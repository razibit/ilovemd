# Rendering audit: supplied `document.html`

Audited against `C:\Users\Razib\Downloads\deep-research-report.md` (also duplicated as `report.md`, 60,127 bytes) on 2026-09-08. The supplied standalone HTML was loaded in Chromium at 1440px and inspected through its DOM, computed geometry, console output, and a full-page raster.

## Findings and repairs

| Symptom | Cause | Repair | Regression evidence |
| --- | --- | --- | --- |
| Flowcharts became enormous vertical strips. The first two SVGs were rendered at 850px wide with heights of 5,249px and 2,638px, despite viewBox widths of 273px and 569px. | Mermaid emitted `width="100%"`; the document stylesheet honored that presentation sizing and stretched narrow diagrams to the paper width. | `renderDiagrams` removes only Mermaid’s unsafe stretch attribute, while scoped document CSS uses intrinsic viewBox sizing with `width:auto; max-width:100%; max-height:1200px; height:auto`. Wide diagrams remain constrained to the document width. | Flowchart export fixture asserts no `width="100%"` remains. The corrected geometry is 194×1,200px and 387×1,200px for the two tall charts at the same paper width. The browser diagram fixture retains labels and sanitized SVG. |
| Standalone HTML contained an empty `Export diagnostics` section at the end of an otherwise clean document. | The HTML adapter created the report section whenever `allowWarnings` was true, even when the warning array was empty. | Report markup is emitted only when warnings exist. | Export format test asserts the clean standalone HTML has no diagnostics heading. |
| The second large heading appears as an H1 in the output. | It is explicitly authored as `> # Your Facebook page...` inside a blockquote in the source homepage-copy mockup. | Preserved as authored content; it is not silently demoted or removed. The outline behavior remains a documented semantic consequence of Markdown heading syntax inside a quote. | Source/output comparison and heading inventory confirm the text and order are preserved. |
| Citation markers such as `cite...` remained visible text. | They were present literally in the supplied Markdown and had no renderer transform. | Citation markers now become accessible superscripts with a generated references list while the original source remains unchanged. | Engine citation fixture and regenerated standalone HTML. |

## Structural checks

The supplied document had no browser console errors, no duplicate DOM IDs, valid table nesting, 10 tables with header cells, 4 code blocks, 18 hyperlinks, 3 SVG diagrams, and no images. Long tables fit their 850px document container at the inspected desktop width. The content contains no raw scripts or event-handler attributes; the apparent script-like content in the source is rendered as text inside a fenced example.

The document’s full-page raster showed that the oversized Mermaid charts were the dominant layout failure. Other visible content remained ordered, searchable, and inside the document column. The corrected shared renderer is covered by engine/export tests and should be regenerated for previously downloaded HTML artifacts; existing downloaded files are immutable snapshots and are not modified automatically.

For review, the repaired artifact was generated as `C:\Users\Razib\Downloads\document-fixed.html`. A fresh Chromium inspection reports no console errors, no horizontal overflow, no duplicate IDs, no diagnostics section, and diagram bounds of 194×1,200px, 387×1,200px, and 850×67px.

## Remaining boundaries

Citation rendering and sanitized SVG upload support are now covered by focused fixtures. The Mermaid allowlist is broader, but every family still needs visual fixture evidence before a full support claim. PDF tagging and outlines are enabled and verified; PDF/UA conformance, reading-order validation with assistive technology, and full screen-reader review remain unverified. Exported HTML must be regenerated after renderer changes; a previously downloaded HTML file cannot update itself.
