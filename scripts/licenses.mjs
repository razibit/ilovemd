import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const rows = [];
const notices = [
  "# Third-party notices\n\nGenerated from installed dependencies. This does not assign a license to Folio itself. Platform-specific optional packages not installed here retain their upstream notices in their distributions. Chromium is distributed by Playwright and retains its own license files.\n",
];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path.includes("node_modules/") || pkg.link) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + 13);
  let license = pkg.license;
  try {
    const meta = JSON.parse(await readFile(`${path}/package.json`, "utf8"));
    license = meta.license ?? license;
    const files = (await readdir(path)).filter((f) =>
      /^(license|licence|copying|notice|ofl)(\.|$)/i.test(f),
    );
    for (const file of files) {
      try {
        notices.push(
          `\n## ${name} ${pkg.version} — ${file}\n\n${await readFile(`${path}/${file}`, "utf8")}\n`,
        );
      } catch {}
    }
  } catch {}
  rows.push({
    name,
    version: pkg.version,
    license: license ?? "REVIEW REQUIRED",
    development: !!pkg.dev,
    resolved: pkg.resolved,
  });
}
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/dependencies.json",
  JSON.stringify(
    { generatedAt: new Date().toISOString(), packages: rows },
    null,
    2,
  ),
);
console.log(
  `Recorded ${rows.length} dependency notices. Review font and Chromium distribution licenses separately.`,
);
await writeFile("docs/THIRD_PARTY_NOTICES.md", notices.join("\n"));
