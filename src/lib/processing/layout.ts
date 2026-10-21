import type { Word } from "@/lib/compare/types";

/** Fragmento de texto posicionado (vindo do PDF.js ou do OCR), em pixels da página. */
export interface Fragment {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converte fragmentos posicionados em palavras com quebras de linha e de parágrafo.
 * Ordem de leitura: linhas de cima para baixo, fragmentos da esquerda para a direita.
 */
export function layoutWords(fragments: Fragment[], pageWidth: number, pageHeight: number): Word[] {
  const frags = fragments.filter((f) => f.str.trim() && f.width > 0 && f.height > 0);
  if (frags.length === 0) return [];

  // 1. Linhas: agrupa por linha de base parecida.
  const sorted = [...frags].sort((a, b) => a.top + a.height - (b.top + b.height) || a.left - b.left);
  const lines: Fragment[][] = [];
  for (const f of sorted) {
    const base = f.top + f.height;
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    if (ref && Math.abs(ref.top + ref.height - base) < Math.min(ref.height, f.height) * 0.5) line!.push(f);
    else lines.push([f]);
  }
  for (const l of lines) l.sort((a, b) => a.left - b.left);

  // 2. Espaçamento típico entre linhas, para detectar parágrafos.
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i]![0]!.top - lines[i - 1]![0]!.top);
  const typicalGap = median(gaps.filter((g) => g > 0)) || lines[0]![0]!.height * 1.3;
  const maxRight = Math.max(...lines.map((l) => l[l.length - 1]!.left + l[l.length - 1]!.width));
  const minLeft = Math.min(...lines.map((l) => l[0]!.left));

  const words: Word[] = [];
  let prevLineText = "";
  let prevLineRight = 0;
  lines.forEach((line, li) => {
    const first = line[0]!;
    const lineText = line.map((f) => f.str).join(" ").trim();
    const gap = li > 0 ? first.top - lines[li - 1]![0]!.top : 0;
    const startsList = /^\s*(?:[•▪◦·●\-–—]\s|\(?[a-z0-9]{1,3}[.)]\s|cl[áa]usula|§)/i.test(lineText);
    const prevEndsSentence = /[.:;!?]$/.test(prevLineText) && prevLineRight < maxRight - (maxRight - minLeft) * 0.12;
    const newPara = li === 0 || gap > typicalGap * 1.45 || startsList || prevEndsSentence;

    // 3. Palavras: junta fragmentos colados (sem espaço visual) e separa por espaço.
    let lineStart = true;
    let pending: { t: string; left: number; right: number; top: number; height: number } | null = null as
      | { t: string; left: number; right: number; top: number; height: number }
      | null;
    const flush = () => {
      if (!pending || !pending.t) return;
      words.push({
        t: pending.t,
        x: round(pending.left / pageWidth),
        y: round(pending.top / pageHeight),
        w: round((pending.right - pending.left) / pageWidth),
        h: round(pending.height / pageHeight),
        ...(lineStart ? { lb: 1 as const } : {}),
        ...(lineStart && newPara ? { pb: 1 as const } : {}),
      });
      lineStart = false;
      pending = null;
    };

    for (const f of line) {
      const charW = f.width / Math.max(f.str.length, 1);
      const glued = pending !== null && f.left - pending.right < f.height * 0.12 && !/^\s/.test(f.str);
      if (!glued) flush();
      let cursor = f.left;
      let firstPart = true;
      for (const m of f.str.matchAll(/(\s*)(\S+)/g)) {
        const lead = m[1] ?? "";
        const text = m[2] ?? "";
        cursor += lead.length * charW;
        const w = text.length * charW;
        if (!(firstPart && glued && lead === "")) flush();
        const cur = pending as { t: string; left: number; right: number; top: number; height: number } | null;
        if (cur) {
          cur.t += text;
          cur.right = cursor + w;
          cur.height = Math.max(cur.height, f.height);
          cur.top = Math.min(cur.top, f.top);
        } else pending = { t: text, left: cursor, right: cursor + w, top: f.top, height: f.height };
        cursor += w;
        firstPart = false;
      }
      if (/\s$/.test(f.str)) flush();
    }
    flush();
    prevLineText = lineText;
    const last = line[line.length - 1]!;
    prevLineRight = last.left + last.width;
  });
  return words;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
