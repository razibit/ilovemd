import type { Asset } from "@folio/engine";
export async function imageAsset(file: Blob, name: string): Promise<Asset> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Image exceeds 10 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  const mime =
    bytes[0] === 137 && ascii(1, 3) === "PNG"
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216
        ? "image/jpeg"
        : ascii(0, 3) === "GIF"
          ? "image/gif"
          : ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
            ? "image/webp"
            : file.type === "image/svg+xml" ? "image/svg+xml" : null;
  if (!mime)
    throw new Error(
      "Use a PNG, JPEG, WebP, GIF, or sanitized SVG image.",
    );
  let normalized = bytes;
  if (mime === "image/svg+xml") {
    const source = new TextDecoder().decode(bytes);
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror"))
      throw new Error("SVG is malformed.");
    for (const element of [...doc.querySelectorAll("script,foreignObject,style")]) element.remove();
    for (const element of [...doc.querySelectorAll("*")])
      for (const attr of [...element.attributes]) {
        if (/^on/i.test(attr.name) || /^(href|xlink:href)$/i.test(attr.name) && !attr.value.startsWith("#") || /url\s*\(/i.test(attr.value))
          element.removeAttribute(attr.name);
      }
    const clean = new XMLSerializer().serializeToString(svg);
    normalized = new TextEncoder().encode(clean);
    if (normalized.length > 10 * 1024 * 1024) throw new Error("SVG exceeds 10 MiB.");
  }
  const blob = new Blob([normalized], { type: mime });
  if (mime !== "image/svg+xml") {
    const bitmap = await createImageBitmap(blob);
    const pixels = bitmap.width * bitmap.height;
    bitmap.close();
    if (pixels > 32000000) throw new Error("Image exceeds 32 megapixels.");
  }
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", normalized)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { path: `assets/${hash}.${mime === "image/svg+xml" ? "svg" : mime.split("/")[1]}`, name, mime, data };
}
export function download(
  data: Blob | string,
  name: string,
  mime = "text/plain",
) {
  const blob =
    typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
