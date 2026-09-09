import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDocument } from "@folio/engine";
import { fixture, scientific } from "./fixtures";
import { linkCases } from "./rendering-regression";
test("newlines, JSON, links and imported table breaks preserve source semantics", async () => {
  for (const source of [linkCases, linkCases.replaceAll("\n", "\r\n")]) {
    const doc = JSON.parse(JSON.stringify(fixture(source)));
    const ordinary = await renderDocument(doc);
    assert.equal(doc.source, source);
    assert.match(ordinary.html, /education<br>\n<a href="https:\/\/example.com\/table"/);
    assert.equal(ordinary.diagnostics.length, 0);
    const converted = ordinary;
    assert.match(converted.html, /education<br>\n<a href="https:\/\/example.com\/table"/);
    assert.match(converted.html, /foo\\nbar/);
    assert.match(converted.html, /education\s+<a href="https:\/\/example.com\/learn\?a=1&#x26;b=2"/);
    assert.equal(doc.source, source);
    assert.equal(converted.diagnostics.length, 0);
  }
  const doc = fixture('| Literal |\n| --- |\n| \\\\n and `\\n` |');
  assert.doesNotMatch((await renderDocument(doc)).html, /<br>/);
});
test("table prose supports multiple rendered literal-newline breaks", async () => {
  const source = "| Content |\n| --- |\n| **Credit**  \\n**৳18,000 available**  \\n*Your first 90 days* |";
  const result = await renderDocument(fixture(source));
  assert.match(result.html, /<strong>Credit<\/strong><br>\n<strong>৳18,000 available<\/strong><br>\n<em>Your first 90 days<\/em>/);
  assert.equal(result.diagnostics.length, 0);
});
test("literal URL table separators repair GFM's split protocol autolink", async () => {
  const source = "| Source |\n| --- |\n| **eBay Seller Center**  \\nhttps://www.ebay.com/sellercenter/selling/start-selling-on-ebay |";
  const result = await renderDocument(fixture(source));
  assert.match(result.html, /<br>\n<a href="https:\/\/www\.ebay\.com\/sellercenter\/selling\/start-selling-on-ebay"/);
  assert.doesNotMatch(result.html, /\\nhttps:\/\//);
  assert.equal(result.diagnostics.length, 0);
});
test("scientific content preserves source, math, tables, columns and mappings", async () => {
  const doc = fixture(scientific);
  const result = await renderDocument(doc);
  assert.equal(doc.source, scientific);
  assert.equal(
    result.diagnostics.length,
    0,
    JSON.stringify(result.diagnostics),
  );
  assert.match(result.html, /katex/);
  assert.match(result.html, /<math/);
  assert.match(result.html, /<table/);
  assert.match(result.html, /folio-columns/);
  assert.match(result.html, /data-source-start/);
  assert.ok(result.outline.length >= 3);
  assert.match(result.html, /বাংলা/);
});
test("untrusted HTML and unsafe links cannot execute", async () => {
  const result = await renderDocument(
    fixture(
      "<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>",
    ),
  );
  assert.doesNotMatch(result.html, /<script|<img|href="javascript:/);
  assert.match(result.html, /&#x3C;script/);
  assert.ok(result.diagnostics.length >= 2);
});
test("malformed math stays visible and reports a diagnostic", async () => {
  const result = await renderDocument(
    fixture("# Surrounding content\n\n$\\notACommand{x}$\n\nAfter math."),
  );
  assert.match(result.html, /After math/);
  assert.match(result.html, /notACommand/);
  assert.ok(result.diagnostics.some((d) => d.code === "MATH_ERROR"));
});
test("missing assets are visible errors rather than omissions", async () => {
  const result = await renderDocument(
    fixture("![Example](https://example.com/image.png)"),
  );
  assert.match(result.html, /Image unavailable: Example/);
  assert.equal(result.diagnostics[0].code, "MISSING_ASSET");
});
test("single dollar can be disabled; code and escaped currency are literal", async () => {
  const doc = fixture("Price \\$5. Code `$x$`. Inline $x$.");
  doc.settings.singleDollarMath = false;
  const result = await renderDocument(doc);
  assert.doesNotMatch(result.html, /class="katex/);
  assert.match(result.html, /\$5/);
});
test("escaped data newlines before URLs render as whitespace outside code", async () => {
  const source = "See [the source](https://example.com)\\nhttps://example.com/docs\n\n`\\nhttps://example.com/literal`";
  const result = await renderDocument(fixture(source));
  assert.doesNotMatch(result.html, new RegExp("\\\\\\\\nhttps://example\\.com/docs"));
  assert.match(result.html, new RegExp("https://example\\.com/docs"));
  assert.ok(result.html.includes("<code>\\nhttps://example.com/literal</code>"));
});
test("newline handling survives JSON and CRLF without changing literal code", async () => {
  const source = "Title\\r\\nhttps://example.com/docs\\r\\n\\r\\n`\\n`";
  const roundTrip = JSON.parse(JSON.stringify(source));
  const result = await renderDocument(fixture(roundTrip));
  assert.match(result.html, /https:\/\/example\.com\/docs/);
  assert.match(result.html, /<code>\\n<\/code>/);
});
test("citation markers render as accessible references without changing source", async () => {
  const source = "Research claim citeturn1search0turn2search3 and code `citeliteral`.";
  const result = await renderDocument(fixture(source));
  assert.equal(fixture(source).source, source);
  assert.match(result.html, /class="citation"/);
  assert.match(result.html, /Citation 1/);
  assert.match(result.html, /<h2[^>]*>References<\/h2>/);
  assert.match(result.html, /turn1search0 · turn2search3/);
  assert.match(result.html, /citeliteral/);
});
test("supported Mermaid families remain source-visible for client rendering", async () => {
  const result = await renderDocument(fixture("```mermaid\nclassDiagram\n  class Writer\n```"));
  assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
  assert.match(result.html, /diagram-container/);
  assert.match(result.html, /mermaid-source/);
});
test("long Mermaid labels remain in the diagram source for measured SVG layout", async () => {
  const label = "Preview the selected shop handle before continuing";
  const source = ["```mermaid", "flowchart LR", ` A[${label}] --> B[OTP verified]`, "```"].join(String.fromCharCode(10));
  const result = await renderDocument(fixture(source));
  assert.match(result.html, /diagram-container/);
});
test("unknown directives retain children and macro recursion fails safely", async () => {
  const d = fixture(":::unknown\nRetained words\n:::\n\n$\\loop$");
  d.settings.macros = { "\\loop": "\\loop" };
  const r = await renderDocument(d);
  assert.match(r.html, /Retained words/);
  assert.ok(r.diagnostics.some((x) => x.code === "UNKNOWN_DIRECTIVE"));
  assert.ok(r.diagnostics.some((x) => x.code === "MATH_ERROR"));
});
test("incomplete structures do not crash surrounding document", async () => {
  for (const source of [
    "$$\n\\frac{",
    "| a | b\n|",
    "```js\nconst x =",
    ":::columns\nUnclosed",
    "[unfinished](https://",
  ]) {
    const r = await renderDocument(fixture(source));
    assert.ok(typeof r.html === "string");
  }
});

