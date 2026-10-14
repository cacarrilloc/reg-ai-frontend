import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { optimizePptxScreenshots, rewritePptxContentTypes } from "./optimize-pptx-upload";

describe("rewritePptxContentTypes", () => {
  it("switches screenshot overrides to jpeg", () => {
    const xml = `<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/media/image1.png" ContentType="image/png"/>
</Types>`;

    const next = rewritePptxContentTypes(xml, ["ppt/media/image1.png"]);

    expect(next).toContain('PartName="/ppt/media/image1.png"');
    expect(next).toContain('ContentType="image/jpeg"');
    expect(next).not.toContain('PartName="/ppt/media/image1.png" ContentType="image/png"');
  });
});

describe("optimizePptxScreenshots", () => {
  it("leaves small or non-pptx files unchanged", async () => {
    const text = new File([new Uint8Array(12)], "notes.txt", { type: "text/plain" });
    await expect(optimizePptxScreenshots(text)).resolves.toBe(text);

    const tinyDeck = zipSync({
      "[Content_Types].xml": new Uint8Array([1, 2, 3])
    });
    const pptx = new File([tinyDeck], "tiny.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });
    await expect(optimizePptxScreenshots(pptx)).resolves.toBe(pptx);
  });
});
