import { wordTokenIndex } from "@/lib/compare/engine";
import type { PageText, Rect } from "@/lib/compare/types";

/**
 * Texto do documento como uma sequência de tokens com página, parágrafo e caixa.
 * Base comum da extração de campos, da busca de trechos do assistente e dos resumos:
 * tudo o que eles mostram aponta para tokens daqui, e portanto para um lugar real do documento.
 */
export interface CToken {
  /** Texto original. */
  t: string;
  /** Forma de comparação: minúsculas, sem acentos e sem pontuação nas pontas. */
  f: string;
  page: number;
  para: number;
  /** Índice do token no motor de comparação (destaque em DOCX). */
  eng: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Corpus {
  tokens: CToken[];
  /** Parágrafos: [início, fim) em índices de token. */
  paras: [number, number][];
  pageCount: number;
}

/** Referência a um trecho do documento. */
export interface Span {
  page: number;
  /** Intervalo em índices do corpus. */
  start: number;
  end: number;
  /** Intervalo em índices de token do motor (para destacar DOCX). */
  from: number;
  to: number;
  text: string;
  rects: Rect[];
}

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}$€£%]+|[^\p{L}\p{N}%]+$/gu, "");
}

export function buildCorpus(pages: PageText[]): Corpus {
  const map = wordTokenIndex(pages);
  const tokens: CToken[] = [];
  const paras: [number, number][] = [];
  let para = -1;
  pages.forEach((page, pi) => {
    page.words.forEach((w, wi) => {
      const t = w.t.trim();
      if (!t) return;
      if (w.pb || para < 0) {
        if (para >= 0) paras[para]![1] = tokens.length;
        para++;
        paras.push([tokens.length, tokens.length]);
      }
      tokens.push({ t, f: fold(t), page: page.page, para, eng: map[pi]?.[wi] ?? -1, x: w.x, y: w.y, w: w.w, h: w.h });
    });
  });
  if (para >= 0) paras[para]![1] = tokens.length;
  return { tokens, paras, pageCount: pages.length };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Retângulos por linha para um intervalo de tokens (vazio em DOCX, que não tem coordenadas). */
export function rectsOf(c: Corpus, start: number, end: number): Rect[] {
  const rects: Rect[] = [];
  for (let i = start; i < end; i++) {
    const t = c.tokens[i]!;
    if (t.w <= 0) continue;
    const last = rects[rects.length - 1];
    if (last && last.page === t.page && Math.abs(last.y - t.y) < t.h * 0.5 && t.x >= last.x) {
      const right = Math.max(last.x + last.w, t.x + t.w);
      last.y = Math.min(last.y, t.y);
      last.h = Math.max(last.h, t.h);
      last.w = right - last.x;
    } else rects.push({ page: t.page, x: t.x, y: t.y, w: t.w, h: t.h });
  }
  return rects.map((r) => ({ page: r.page, x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
}

export function textOf(c: Corpus, start: number, end: number): string {
  return c.tokens
    .slice(start, end)
    .map((t) => t.t)
    .join(" ");
}

export function spanOf(c: Corpus, start: number, end: number): Span {
  const s = Math.max(0, start);
  const e = Math.min(c.tokens.length, Math.max(end, s + 1));
  const engs = c.tokens.slice(s, e).map((t) => t.eng).filter((n) => n >= 0);
  return {
    page: c.tokens[s]?.page ?? 1,
    start: s,
    end: e,
    from: engs.length ? Math.min(...engs) : -1,
    to: engs.length ? Math.max(...engs) + 1 : -1,
    text: textOf(c, s, e),
    rects: rectsOf(c, s, e),
  };
}

/** Frase que contém o token (limitada ao parágrafo), para mostrar o contexto de uma evidência. */
export function sentenceAround(c: Corpus, start: number, end: number, max = 60): [number, number] {
  const [ps, pe] = c.paras[c.tokens[start]?.para ?? 0] ?? [0, c.tokens.length];
  let s = start;
  while (s > ps && start - s < max && !/[.;:!?]$/.test(c.tokens[s - 1]!.t)) s--;
  let e = end;
  while (e < pe && e - end < max && !/[.;!?]$/.test(c.tokens[e - 1]?.t ?? "")) e++;
  return [s, e];
}

/**
 * Localiza um trecho citado (por exemplo, devolvido pela IA) no documento.
 * A comparação ignora acentos, caixa e pontuação; devolve null se o trecho não existir.
 * É o que impede a IA de "citar" algo que o documento não diz.
 */
export function locateQuote(c: Corpus, quote: string, page?: number): Span | null {
  const q = quote.split(/\s+/).map(fold).filter(Boolean);
  if (q.length === 0) return null;
  const tryFrom = (pageOnly: boolean) => {
    for (let i = 0; i + q.length <= c.tokens.length; i++) {
      if (pageOnly && c.tokens[i]!.page !== page) continue;
      let ok = true;
      for (let k = 0; k < q.length; k++) {
        if (c.tokens[i + k]!.f !== q[k]) {
          ok = false;
          break;
        }
      }
      if (ok) return spanOf(c, i, i + q.length);
    }
    return null;
  };
  return (page ? tryFrom(true) : null) ?? tryFrom(false);
}
