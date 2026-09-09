import { replaceEditor } from './helpers';
import { test, expect } from '@playwright/test';
import { linkCases, diagramCases } from '../rendering-regression';

test('clipboard paste retains real and literal newline characters', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native clipboard permission exercised in Chromium/Chrome.');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');
  const editor=page.getByRole('textbox',{name:'Markdown source'});
  await replaceEditor(editor, '');
  await page.evaluate(source=>navigator.clipboard.writeText(source),linkCases);
  await editor.press('Control+V');
  await expect(page.locator('article h2')).toHaveText('Links');
  await expect(page.locator('article td')).toContainText(['Meta education\nhttps://example.com/table','foo\\nbar']);
  await expect(page.locator('article a[href="https://example.com/learn"]')).toHaveCount(1);
});

test('link import, explicit table breaks, view switching and recovery', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name:'links.md', mimeType:'text/markdown', buffer:Buffer.from(linkCases) });
  await expect(page.locator('article')).toContainText('Meta education');
  await expect(page.locator('article td').first()).not.toContainText('education\\n');
  await expect(page.locator('article td br')).toHaveCount(1);
  await expect(page.locator('article td code')).toHaveText('foo\\nbar');
  await expect(page.locator('article a[href="https://example.com/table"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('article td br')).toHaveCount(1);
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  await expect(page.locator('.save-indicator')).toContainText('Saved on this device');
  await page.reload();
  await expect(page.locator('article td br')).toHaveCount(1);
  await expect(page.getByRole('textbox',{name:'Markdown source'})).toContainText('education\\nhttps');
});

test('diagram labels remain inside nodes across themes, widths and zoom', async ({ page }) => {
  await page.goto('/');
  await replaceEditor(page.getByRole('textbox',{name:'Markdown source'}), diagramCases);
  await expect(page.locator('article .diagram svg')).toHaveCount(1);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({width,height:1000});
    for (const theme of ['light','dark']) {
      await page.locator('article').evaluate((root,theme)=>root.setAttribute('data-theme',theme),theme);
      for (const zoom of [1, 1.25]) {
        const failures=await page.locator('article').evaluate((root,zoom)=>{
          root.style.zoom=String(zoom);root.style.setProperty('--doc-font','24px');
          return [...root.querySelectorAll('g.node')].flatMap(n=>{
            const rect=n.querySelector('rect.label-container')?.getBoundingClientRect();
            const text=n.querySelector('text')?.getBoundingClientRect();
            if(!rect||!text) return ['Missing node or text'];
            return text.x<rect.x-1||text.right>rect.right+1||text.y<rect.y-1||text.bottom>rect.bottom+1 ? [n.textContent] : [];
          });
        },zoom);
        expect(failures,`${width}/${theme}/${zoom}`).toEqual([]);
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('article').evaluate(root=>{root.style.zoom='1';root.setAttribute('data-theme','light')});
  await page.locator('article .diagram').screenshot({path:'output/label-after.png'});
});
