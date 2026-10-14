import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const MEDIA_PATH = /^ppt\/media\/.+\.(png|jpe?g|webp|bmp)$/i;
const CONTENT_TYPES_PATH = "[Content_Types].xml";
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.72;

function mimeForMediaPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewritePptxContentTypes(xml: string, convertedParts: string[]): string {
  let next = xml;
  for (const part of convertedParts) {
    const partName = `/${part.replace(/^\/+/, "")}`;
    const override = new RegExp(
      `<Override\\s([^>]*PartName="${escapeRegExp(partName)}"[^>]*)/?>`,
      "i"
    );
    if (override.test(next)) {
      next = next.replace(override, (_match, attrs: string) => {
        const cleaned = String(attrs)
          .replace(/\sContentType="[^"]*"/i, "")
          .trim();
        return `<Override ${cleaned} ContentType="image/jpeg"/>`;
      });
      continue;
    }
    next = next.replace(
      "</Types>",
      `  <Override PartName="${partName}" ContentType="image/jpeg"/>\n</Types>`
    );
  }
  return next;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function jpegFromRaster(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return null;
  }
  const blob = new Blob([toArrayBuffer(bytes)], { type: mime });
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const encoded = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!encoded) {
      return null;
    }
    return new Uint8Array(await encoded.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

/** Shrink screenshot media inside a PPTX so proxy/API body limits do not 413 the upload. */
export async function optimizePptxScreenshots(file: File): Promise<File> {
  if (!file.name.toLowerCase().endsWith(".pptx") || file.size < 1024 * 1024) {
    return file;
  }

  try {
    const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const converted: string[] = [];
    for (const [path, bytes] of Object.entries(unzipped)) {
      if (!MEDIA_PATH.test(path)) {
        continue;
      }
      const jpeg = await jpegFromRaster(bytes, mimeForMediaPath(path));
      if (!jpeg || jpeg.byteLength >= bytes.byteLength) {
        continue;
      }
      unzipped[path] = new Uint8Array(toArrayBuffer(jpeg));
      converted.push(path);
    }
    if (converted.length === 0) {
      return file;
    }
    const typesFile = unzipped[CONTENT_TYPES_PATH];
    if (typesFile) {
      unzipped[CONTENT_TYPES_PATH] = new Uint8Array(
        toArrayBuffer(strToU8(rewritePptxContentTypes(strFromU8(typesFile), converted)))
      );
    }
    const zipped = zipSync(unzipped, { level: 6 });
    if (zipped.byteLength >= file.size) {
      return file;
    }
    return new File([toArrayBuffer(zipped)], file.name, {
      type: file.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      lastModified: file.lastModified
    });
  } catch {
    return file;
  }
}
