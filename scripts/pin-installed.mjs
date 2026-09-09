import { readFile, writeFile } from "node:fs/promises";
for (const file of [
  "package.json",
  "apps/web/package.json",
  "apps/export/package.json",
  "packages/engine/package.json",
  "packages/themes/package.json",
]) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  for (const field of ["dependencies", "devDependencies"])
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name.startsWith("@folio/")) continue;
      const installed = JSON.parse(
        await readFile(`node_modules/${name}/package.json`, "utf8"),
      );
      manifest[field][name] = installed.version;
    }
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
}
