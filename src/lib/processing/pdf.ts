import type { PageText } from "@/lib/compare/types";
import { layoutWords, type Fragment } from "./layout";

/**
 * Extrai o texto de um PDF com coordenadas por palavra (PDF.js, build legacy para Node).
 * Páginas sem texto voltam com `words: []` — candidatas a OCR.
 */
export async function extractPdf(bytes: Uint8Array): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(), // o PDF.js transfere o buffer; uma cópia protege quem chamou
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  const pages: PageText[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const fragments: Fragment[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2]!, tx[3]!);
        if (!fontHeight) continue;
        fragments.push({
          str: item.str,
          left: tx[4]!,
          top: tx[5]! - fontHeight,
          width: item.width * viewport.scale,
          height: fontHeight * 1.15,
        });
      }
      pages.push({ page: n, width: viewport.width, height: viewport.height, words: layoutWords(fragments, viewport.width, viewport.height) });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
