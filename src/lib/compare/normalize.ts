/**
 * Normalização controlada: só remove diferenças que não são de conteúdo
 * (Unicode, aspas e travessões tipográficos, ligaduras, espaços invisíveis).
 * Números, datas, pontuação e maiúsculas continuam intactos na chave de comparação.
 */
const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—―−]/g, "-"],
  [/ﬀ/g, "ff"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ﬃ/g, "ffi"],
  [/ﬄ/g, "ffl"],
  [/[   ​⁠﻿]/g, ""],
  [/…/g, "..."],
  [/º/g, "º"],
];

export function normalizeToken(text: string): string {
  let s = text.normalize("NFC");
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to);
  return s;
}

/** Forma "frouxa": ignora caixa, acentos e pontuação. Usada só para detectar mudanças de formatação. */
export function looseForm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const MONTHS = "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
export const RE_DATE = new RegExp(`\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b|\\b\\d{1,2}\\s+de\\s+(?:${MONTHS})(?:\\s+de\\s+\\d{4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, "i");
export const RE_MONEY = /(?:R\$|US\$|U\$|€|£|\bUSD\b|\bBRL\b|\bEUR\b)\s*[\d.,]+|[\d.,]+\s*(?:reais|d[óo]lares|euros)\b/i;
export const RE_NUMBER = /\d/;
export const RE_PERCENT = /\d[\d.,]*\s*%/;
export const RE_ENTITY = /\b(?:ltda|s\.?\s?a\.?|s\/a|eireli|me|epp|inc|llc|ltd|gmbh|seguradora|resseguros?|corretora)\b/i;
export const RE_CLAUSE = /^(?:cl[áa]usula|art(?:igo)?\.?|§|par[áa]grafo|cap[íi]tulo|se[çc][ãa]o|item|anexo|\d+(?:\.\d+)*[.)]?\s)/i;

/** Remove números (e o número por extenso entre parênteses) para saber se SÓ os números mudaram. */
export function withoutNumbers(text: string): string {
  return looseForm(text.replace(/\([^)]*\)/g, "").replace(/\d+/g, "#"));
}
