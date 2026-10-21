import type { PageText } from "../../src/lib/compare/types";

/** Monta páginas a partir de texto: linhas em branco separam parágrafos; "\f" separa páginas. */
export function pagesFromText(text: string): PageText[] {
  return text.split("\f").map((pageText, pi) => {
    const words: PageText["words"] = [];
    let y = 0.05;
    for (const para of pageText.split(/\n\s*\n/)) {
      const lines = para.split("\n").filter((l) => l.trim());
      lines.forEach((line, li) => {
        let x = 0.08;
        line.trim().split(/\s+/).forEach((t, wi) => {
          const w = Math.min(0.2, t.length * 0.008);
          words.push({ t, x, y, w, h: 0.012, ...(li === 0 && wi === 0 ? { pb: 1 as const } : wi === 0 ? { lb: 1 as const } : {}) });
          x += w + 0.006;
        });
        y += 0.018;
      });
      y += 0.01;
    }
    return { page: pi + 1, width: 595, height: 842, words };
  });
}
