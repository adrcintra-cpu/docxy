import { fold, spanOf, type Corpus } from "@/lib/extract/corpus";
import type { Citation, SourceDoc } from "./types";

/**
 * Recuperação de trechos relevantes (BM25 sobre parágrafos), sem serviços externos.
 * É o que dá ao assistente — com ou sem IA — os trechos citáveis para responder.
 */

const STOP = new Set(
  "a o as os de da do das dos e é em no na nos nas um uma uns umas por para com sem que se ao aos à às ou como mais menos foi foram ser sao são há ha qual quais quem onde quando este esta isto esse essa isso aquele aquela seu sua seus suas pelo pela pelos pelas entre sobre até ate já ja não nao sim houve tem têm documento documentos contrato".split(
    " ",
  ).map((w) => fold(w)),
);

export function stem(f: string): string {
  let w = f.replace(/[^\p{L}\p{N}$%]/gu, "");
  if (w.length > 4) w = w.replace(/(oes|aes|ais|eis|is|es|s)$/, "");
  if (w.length > 6) w = w.replace(/(mente|cao|coes|dade|ivel|ados|adas|ado|ada|ando|endo)$/, "");
  return w.slice(0, 7);
}

const SYNONYMS: Record<string, string[]> = {
  valor: ["premio", "r$", "preco", "pagamento", "pagara"],
  valore: ["premio", "r$", "preco", "pagamento"],
  premio: ["valor", "r$"],
  prazo: ["dia", "vigenci", "inicio", "termino", "fim", "data"],
  data: ["dia", "vigenci", "inicio", "fim"],
  vigenci: ["inicio", "fim", "termino", "prazo"],
  multa: ["penalid", "sancao"],
  obrigac: ["dever", "obriga", "respons", "compromi", "devera"],
  parte: ["contrat", "cedente", "broker", "segurad"],
  risco: ["multa", "rescisa", "indeniz", "respons", "penalid"],
  pagamen: ["pagara", "fatura", "r$", "valor"],
  sigilo: ["confide"],
};

export function queryTerms(q: string): string[] {
  const base = q
    .split(/\s+/)
    .map(fold)
    .filter((w) => w && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length >= 2);
  const out = new Set(base);
  for (const t of base) for (const s of SYNONYMS[t] ?? []) out.add(s);
  return [...out];
}

export interface Passage {
  doc: SourceDoc;
  start: number;
  end: number;
  terms: string[];
}

export function passagesOf(doc: SourceDoc, size = 80, overlap = 20): Passage[] {
  const c: Corpus = doc.corpus;
  const out: Passage[] = [];
  for (const [s, e] of c.paras) {
    for (let a = s; a < e; a += size - overlap) {
      const b = Math.min(e, a + size);
      out.push({ doc, start: a, end: b, terms: c.tokens.slice(a, b).map((t) => stem(t.f)) });
      if (b === e) break;
    }
  }
  return out;
}

export interface Scored extends Passage {
  score: number;
  matched: number;
}

export function search(docs: SourceDoc[], q: string, k = 6): Scored[] {
  const terms = queryTerms(q);
  if (terms.length === 0) return [];
  const all = docs.flatMap((d) => passagesOf(d));
  const N = all.length || 1;
  const avg = all.reduce((s, p) => s + p.terms.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, all.filter((p) => p.terms.some((x) => x.startsWith(t))).length);
  const k1 = 1.2;
  const b = 0.75;
  const scored = all.map((p) => {
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      const tf = p.terms.filter((x) => x.startsWith(t)).length;
      if (!tf) continue;
      matched++;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * p.terms.length) / avg));
    }
    return { ...p, score, matched };
  });
  return scored
    .filter((p) => p.score > 0)
    .sort((x, y) => y.score - x.score || x.start - y.start)
    .slice(0, k);
}

export function citationOf(doc: SourceDoc, start: number, end: number, id: string): Citation {
  const span = spanOf(doc.corpus, start, end);
  return { id, versionId: doc.versionId, docTitle: doc.title, page: span.page, text: span.text, rects: span.rects, from: span.from, to: span.to };
}
