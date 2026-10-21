import type { Word } from "@/lib/compare/types";
import { layoutWords, type Fragment } from "./layout";

/**
 * OCR para páginas digitalizadas (sem texto extraível).
 *
 * Ligado por OCR_ENABLED=true. Usa pacotes opcionais, carregados só quando necessário:
 *   npm install tesseract.js @napi-rs/canvas
 * Idioma: OCR_LANG (padrão "por"). A página é renderizada pelo PDF.js a 2x e reconhecida.
 * Sem OCR, a página fica marcada como "sem texto extraível" e a comparação a ignora.
 */
export const OCR_ENABLED = process.env.OCR_ENABLED === "true";

type TesseractWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number };

export async function ocrPdfPages(bytes: Uint8Array, pageNumbers: number[]): Promise<Map<number, Word[]>> {
  const result = new Map<number, Word[]>();
  if (!OCR_ENABLED || pageNumbers.length === 0) return result;

  // Importações dinâmicas: a aplicação funciona sem estes pacotes instalados.
  const importOptional = (name: string) => import(/* webpackIgnore: true */ name);
  const [{ createWorker }, canvasMod, pdfjs] = await Promise.all([
    importOptional("tesseract.js"),
    importOptional("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);

  const worker = await createWorker(process.env.OCR_LANG ?? "por");
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    for (const n of pageNumbers) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      // pdf.js aceita um canvas compatível; o cast evita depender dos tipos do pacote opcional.
      await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const image = canvas.toBuffer("image/png");

      const { data } = await worker.recognize(image, {}, { blocks: true });
      const tWords: TesseractWord[] =
        data.words ??
        (data.blocks ?? []).flatMap((b: { paragraphs: { lines: { words: TesseractWord[] }[] }[] }) =>
          b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
        );
      const fragments: Fragment[] = tWords
        .filter((w) => w.text.trim() && w.confidence > 35)
        .map((w) => ({ str: w.text, left: w.bbox.x0, top: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 }));
      result.set(n, layoutWords(fragments, canvas.width, canvas.height));
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    await task.destroy();
  }
  return result;
}
