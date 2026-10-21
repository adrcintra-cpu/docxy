import JSZip from "jszip";
import type { PageText, Word } from "@/lib/compare/types";

/** Palavras por "página" ao paginar um DOCX (o arquivo não tem paginação fixa). */
const WORDS_PER_PAGE = 450;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m),
  );

/**
 * Extrai o texto de um DOCX lendo word/document.xml: parágrafos (w:p), textos (w:t),
 * tabulações e quebras de linha. Não há coordenadas; o visualizador mostra o texto refluído.
 */
export async function extractDocx(bytes: Uint8Array): Promise<PageText[]> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("docx: word/document.xml ausente");

  const body = xml.replace(/<w:del\b[\s\S]*?<\/w:del>/g, ""); // revisões excluídas não fazem parte do texto
  const paragraphs: string[][] = [];
  for (const p of body.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
    const lines: string[] = [""];
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<w:cr\/>/g)) {
      if (m[0].startsWith("<w:tab")) lines[lines.length - 1] += " ";
      else if (m[0].startsWith("<w:br") || m[0].startsWith("<w:cr")) lines.push("");
      else lines[lines.length - 1] += decode(m[1] ?? "");
    }
    const clean = lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (clean.length) paragraphs.push(clean);
  }

  const pages: PageText[] = [];
  let words: Word[] = [];
  const pushPage = () => {
    if (words.length) pages.push({ page: pages.length + 1, width: 0, height: 0, words });
    words = [];
  };
  for (const lines of paragraphs) {
    const count = lines.join(" ").split(" ").length;
    if (words.length > 0 && words.length + count > WORDS_PER_PAGE) pushPage();
    lines.forEach((line, li) => {
      line.split(" ").forEach((t, wi) => {
        words.push({ t, x: 0, y: 0, w: 0, h: 0, ...(wi === 0 ? { lb: 1 as const } : {}), ...(wi === 0 && li === 0 ? { pb: 1 as const } : {}) });
      });
    });
  }
  pushPage();
  return pages.length ? pages : [{ page: 1, width: 0, height: 0, words: [] }];
}
