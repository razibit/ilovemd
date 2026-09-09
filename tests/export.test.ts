import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  createArtifacts,
  closeRenderer,
  PreflightError,
} from "../apps/export/src/render";
import { defaultExportOptions } from "@folio/engine";
import { fixture, scientific, longTable } from "./fixtures";
import sharp from "sharp";
import { chromium } from 'playwright';
import { linkCases, diagramCases } from './rendering-regression';
test('link breaks and diagram label geometry survive HTML PDF and PNG exports', async () => {
  const doc = fixture(linkCases + '\n\n' + diagramCases);
  doc.settings.escapedTableBreaks = true;
  const original = doc.source;
  await mkdir('output/rendering', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark'] as const) {
      const result = await createArtifacts(doc, { ...defaultExportOptions, theme, format: 'html' });
      assert.equal(result.warnings.length, 0);
      const html = result.artifacts[0].bytes.toString();
      await writeFile(`output/rendering/${theme}.html`, html);
      const page = await browser.newPage();
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('td br').count(), 1);
      assert.equal(await page.locator('td code').textContent(), 'foo\\nbar');
      assert.equal(await page.locator('a[href="https://example.com/table"]').count(), 1);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({width,height:1000});
        const overflow = await page.locator('.diagram').evaluate(root => [...root.querySelectorAll('g.node')].filter(n => {
          const r=n.querySelector('rect.label-container')!.getBoundingClientRect();
          const t=n.querySelector('text')!.getBoundingClientRect();
          return t.x<r.x-1||t.right>r.right+1||t.y<r.y-1||t.bottom>r.bottom+1;
        }).map(n=>n.textContent));
        assert.deepEqual(overflow, [], `${theme}/${width}`);
      }
      await page.close();
      for (const format of ['pdf', 'png'] as const) {
        const artifact=await createArtifacts(doc,{...defaultExportOptions,format,theme,width:1000});
        assert.equal(artifact.warnings.length,0);
        const path=`output/rendering/${theme}.${format}`;
        await writeFile(path,artifact.artifacts[0].bytes);
        if(format==='pdf') {
          execFileSync('pdftotext',['-layout',path,path+'.txt']);
          const text=await readFile(path+'.txt','utf8');
          assert.match(text,/OTP verified/);
          assert.match(text,/Handle availability confirmed/);
          assert.match(text,/foo\\nbar/);
          assert.match(text,/https:\/\/example.com\/table/);
          execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1400','-png',path,`output/rendering/${theme}-pdf-page`]);
        } else {
          const meta=await sharp(artifact.artifacts[0].bytes).metadata();
          assert.equal(meta.width,1000);
          assert.ok(meta.height!>500);
        }
      }
    }
    assert.equal(doc.source,original);
  } finally { await browser.close(); }
});
after(closeRenderer);
test('flowchart exports preserve vector SVG and labels',async()=>{await mkdir('output/pdf',{recursive:true});const d=fixture('# Diagram export\n\n```mermaid\nflowchart LR\n A[Write] --> B[Preview] --> C[Export]\n```');const html=await createArtifacts(d,{...defaultExportOptions,format:'html'});const output=html.artifacts[0].bytes.toString();assert.ok(output.includes('<svg'),'Missing SVG');assert.ok(output.includes('Write'),'Missing diagram label');assert.ok(!output.includes('<script'),'Unexpected script');assert.doesNotMatch(output,/<svg[^>]+width="100%"/);await writeFile('output/pdf/diagram.html',html.artifacts[0].bytes)});
test("actual PDF contains searchable text, table rows, fonts and links", async () => {
  await mkdir("output/pdf", { recursive: true });
  const d = fixture(scientific + "\n\n" + longTable);
  const image = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#40654c" },
  })
    .png()
    .toBuffer();
  d.assets["assets/test.png"] = {
    path: "assets/test.png",
    name: "test",
    mime: "image/png",
    data: `data:image/png;base64,${image.toString("base64")}`,
  };
  d.source += "\n\n![Test image](assets/test.png)";
  const r = await createArtifacts(d, defaultExportOptions);
  assert.equal(r.warnings.length, 0, JSON.stringify(r.warnings));
  const bytes = r.artifacts[0].bytes;
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  await writeFile("output/pdf/regression.pdf", bytes);
  execFileSync("pdftotext", [
    "-layout",
    "output/pdf/regression.pdf",
    "output/pdf/regression.txt",
  ]);
  const text = await readFile("output/pdf/regression.txt", "utf8");
  for (let i = 0; i < 180; i++)
    assert.ok(
      text.includes(`ROW_${String(i).padStart(3, "0")}`),
      `Missing row ${i}`,
    );
  assert.match(text, /FINAL_CONTENT_MARKER/);
  assert.match(text, /Scientific regression/);
  const info = execFileSync("pdfinfo", ["output/pdf/regression.pdf"], {
    encoding: "utf8",
  });
  assert.match(info, /Tagged:\s+yes/);
  assert.ok(Number(info.match(/Pages:\s+(\d+)/)?.[1]) >= 5);
  await writeFile("output/pdf/pdfinfo.txt", info);
  const fonts = execFileSync("pdffonts", ["output/pdf/regression.pdf"], {
    encoding: "utf8",
  });
  await writeFile("output/pdf/fonts.txt", fonts);
  assert.match(fonts, /KaTeX/);
  assert.match(bytes.toString("latin1"), /https:\/\/example.com/);
});
test("missing asset blocks export and explicit warning export retains placeholder", async () => {
  const d = fixture("# Missing\n\n![Lost figure](missing.png)");
  await assert.rejects(
    createArtifacts(d, defaultExportOptions),
    PreflightError,
  );
  const r = await createArtifacts(d, {
    ...defaultExportOptions,
    format: "html",
    allowWarnings: true,
  });
  assert.match(
    r.artifacts[0].bytes.toString(),
    /Image unavailable: Lost figure/,
  );
  assert.match(r.artifacts[0].bytes.toString(), /Export diagnostics/);
});
test("PNG is a real image and standalone HTML has embedded resources", async () => {
  const d = fixture("# Export formats\n\n$\\sqrt{x}$");
  const png = await createArtifacts(d, {
    ...defaultExportOptions,
    format: "png",
    width: 1000,
  });
  const meta = await sharp(png.artifacts[0].bytes).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1000);
  const html = await createArtifacts(d, {
    ...defaultExportOptions,
    format: "html",
  });
  assert.match(html.artifacts[0].bytes.toString(), /data:font\/woff2;base64/);
  assert.doesNotMatch(html.artifacts[0].bytes.toString(), /<script/);
  assert.doesNotMatch(html.artifacts[0].bytes.toString(), /<h2>Export diagnostics<\/h2>/);
  await writeFile("output/pdf/document.png", png.artifacts[0].bytes);
});
test("forged image types and unsafe parameters are rejected by asset validator", async () => {
  const d = fixture("![bad](assets/bad.png)");
  d.assets["assets/bad.png"] = {
    path: "assets/bad.png",
    name: "bad",
    mime: "image/png",
    data: "data:image/png;base64,PHNjcmlwdD4=",
  };
  await assert.rejects(createArtifacts(d, defaultExportOptions));
});
test("sanitized SVG assets are preserved in standalone HTML export", async () => {
  const d = fixture("# SVG\\n\\n![Mark](assets/mark.svg)");
  d.assets["assets/mark.svg"] = {
    path: "assets/mark.svg",
    name: "mark",
    mime: "image/svg+xml",
    data: "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#0f766e"/></svg>').toString("base64"),
  };
  const result = await createArtifacts(d, { ...defaultExportOptions, format: "html" });
  const html = result.artifacts[0].bytes.toString();
  assert.match(html, /data:image\/svg\+xml;base64/);
  assert.doesNotMatch(html, /<script|foreignObject|onload/i);
});

