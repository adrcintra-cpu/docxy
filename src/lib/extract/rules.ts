import { fold, sentenceAround, spanOf, textOf, type Corpus } from "./corpus";
import type { Evidence, FieldDef, FieldItem, FieldResult } from "./types";

/**
 * Extração determinística por regras.
 *
 * Para cada campo: procura os rótulos (aliases) no texto, lê o valor logo depois conforme o tipo
 * (valor monetário, data, período, percentual, nome de parte, código…) e guarda a evidência —
 * página, trecho exato e retângulos. Sem evidência, o campo fica "Não identificado".
 * Nada é inventado: todo valor devolvido aqui é um pedaço real do documento.
 */

// ─── Números, moedas e datas ────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = { r$: "BRL", brl: "BRL", us$: "USD", usd: "USD", u$: "USD", $: "USD", eur: "EUR", "€": "EUR", gbp: "GBP", "£": "GBP" };
const CURRENCY_WORD: Record<string, string> = { reais: "BRL", real: "BRL", dolares: "USD", dolar: "USD", euros: "EUR", euro: "EUR", libras: "GBP" };
export const CURRENCY_NAME: Record<string, string> = { BRL: "Real (BRL)", USD: "Dólar americano (USD)", EUR: "Euro (EUR)", GBP: "Libra esterlina (GBP)" };
const SYMBOL_OUT: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£" };

const RE_NUM = /^\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?$|^\d+(?:[.,]\d+)?$/;
const RE_INLINE_MONEY = /^(r\$|us\$|u\$|€|£|\$)(\d[\d.,]*)$/i;

/** "5.111.442,22" → 5111442.22; "1,234.56" → 1234.56; "30" → 30. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let norm: string;
  if (lastComma > lastDot) norm = s.replace(/\./g, "").replace(",", "."); // pt-BR
  else if (lastDot > lastComma) {
    const decimals = s.length - lastDot - 1;
    // "5.111.442" (milhar pt-BR) × "1,234.56" (inglês)
    norm = lastComma >= 0 || decimals !== 3 ? s.replace(/,/g, "") : s.replace(/\./g, "");
  } else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const clean = (t: string) => t.replace(/^[("'“]+|[)"'”.,;:]+$/g, "");

interface Hit {
  start: number;
  end: number;
  value: string;
  amount?: number;
  currency?: string;
  start_iso?: string;
  end_iso?: string;
}

function moneyAt(c: Corpus, i: number): Hit | null {
  const t = c.tokens[i];
  if (!t) return null;
  const inline = RE_INLINE_MONEY.exec(clean(t.t));
  if (inline) {
    const amount = parseNumber(inline[2]!);
    const cur = CURRENCY_SYMBOL[inline[1]!.toLowerCase()] ?? "BRL";
    if (amount !== null) return { start: i, end: i + 1, value: `${SYMBOL_OUT[cur]} ${clean(inline[2]!)}`, amount, currency: cur };
  }
  const sym = CURRENCY_SYMBOL[t.f] ?? CURRENCY_SYMBOL[clean(t.t).toLowerCase()];
  const next = c.tokens[i + 1];
  if (sym && next && next.para === t.para && RE_NUM.test(clean(next.t))) {
    const amount = parseNumber(next.t);
    if (amount !== null) return { start: i, end: i + 2, value: `${SYMBOL_OUT[sym]} ${clean(next.t)}`, amount, currency: sym };
  }
  if (RE_NUM.test(clean(t.t)) && next && CURRENCY_WORD[next.f]) {
    const amount = parseNumber(t.t);
    const cur = CURRENCY_WORD[next.f]!;
    if (amount !== null) return { start: i, end: i + 2, value: `${SYMBOL_OUT[cur]} ${clean(t.t)}`, amount, currency: cur };
  }
  return null;
}

function percentAt(c: Corpus, i: number): Hit | null {
  const t = c.tokens[i];
  if (!t) return null;
  const s = clean(t.t);
  const m = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?%$/.exec(s);
  if (m) return { start: i, end: i + 1, value: s, amount: parseNumber(m[1]!) ?? undefined };
  const next = c.tokens[i + 1];
  if (/^\d+(?:[.,]\d+)?$/.test(s) && next && next.para === t.para) {
    if (next.t === "%" || next.f === "%") return { start: i, end: i + 2, value: `${s}%`, amount: parseNumber(s) ?? undefined };
    if (next.f === "por" && c.tokens[i + 2]?.f === "cento") return { start: i, end: i + 3, value: `${s}%`, amount: parseNumber(s) ?? undefined };
  }
  return null;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

function dateAt(c: Corpus, i: number): Hit | null {
  const t = c.tokens[i];
  if (!t) return null;
  const s = clean(t.t);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const v = iso(fullYear(Number(m[3])), Number(m[2]), Number(m[1]));
    if (v) return { start: i, end: i + 1, value: s, start_iso: v };
  }
  // "31 de março de 2023", "1º de abril de 2024"
  const d = /^(\d{1,2})[ºo°]?$/.exec(s);
  if (d && c.tokens[i + 1]?.f === "de") {
    const month = MONTHS[c.tokens[i + 2]?.f ?? ""];
    const y = c.tokens[i + 3]?.f === "de" ? /^(\d{4})$/.exec(clean(c.tokens[i + 4]?.t ?? "")) : null;
    if (month && y) {
      const v = iso(Number(y[1]), month, Number(d[1]));
      if (v) return { start: i, end: i + 5, value: textOf(c, i, i + 5).replace(/[.,;:]+$/, ""), start_iso: v };
    }
  }
  return null;
}

// ─── Nomes de partes ────────────────────────────────────────────────────

const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e", "&", "del", "y", "of", "the", "and"]);
const SUFFIX = /^(s\.?\/?a\.?|ltda\.?|cia\.?|inc\.?|ltd\.?|llc|me|epp|eireli|corp\.?|plc|gmbh|sa)$/i;
const isCap = (t: string) => /^[\p{Lu}\d]/u.test(t.replace(/^[("“]+/, ""));

function nameFrom(c: Corpus, j: number, limit = 14): Hit | null {
  const para = c.tokens[j]?.para;
  let end = j;
  for (let k = j; k < c.tokens.length && k - j < limit; k++) {
    const t = c.tokens[k]!;
    if (t.para !== para) break;
    const raw = t.t;
    if (/:$/.test(raw)) break; // começo do próximo rótulo ("Broker:")
    const word = raw.replace(/[,;)]+$/, "");
    if (!(isCap(word) || CONNECTORS.has(t.f) || SUFFIX.test(word))) break;
    end = k + 1;
    if (/[,;)]$/.test(raw)) break;
    if (/\.$/.test(raw) && SUFFIX.test(word)) break; // "S.A." encerra o nome
    if (/\.$/.test(raw) && !SUFFIX.test(word) && !/^\p{Lu}\.$/u.test(word)) break;
  }
  while (end > j && CONNECTORS.has(c.tokens[end - 1]!.f)) end--;
  if (end <= j) return null;
  const value = textOf(c, j, end)
    .replace(/^[("“]+/, "")
    .replace(/[,;:)]+$/, "")
    .replace(/\.$/, (m) => (SUFFIX.test(c.tokens[end - 1]!.t.replace(/[,;)]+$/, "")) ? m : ""));
  if (!/\p{L}{2,}/u.test(value)) return null;
  return { start: j, end, value };
}

/** "…Fulano Ltda., …, doravante denominada CONTRATANTE" → procura o nome no começo da qualificação. */
function nameBefore(c: Corpus, aliasStart: number): Hit | null {
  const para = c.tokens[aliasStart]!.para;
  let d = aliasStart - 1;
  while (d >= 0 && aliasStart - d <= 3 && ["simplesmente", "doravante", "apenas", "como"].includes(c.tokens[d]!.f)) d--;
  if (d < 0 || !/^(denominad|designad|chamad|referid)[ao]s?$/.test(c.tokens[d]!.f)) return null;
  let s = d;
  while (s > 0 && c.tokens[s - 1]!.para === para && d - s < 80 && !/;$/.test(c.tokens[s - 1]!.t)) s--;
  // pula "de um lado," / "e, de outro lado," até o primeiro nome
  for (let k = s; k < d; k++) {
    const t = c.tokens[k]!;
    if (isCap(t.t) && !["De", "E", "Pelo", "Pela", "O", "A"].includes(t.t.replace(/,$/, ""))) return nameFrom(c, k);
  }
  return null;
}

// ─── Busca de rótulos ───────────────────────────────────────────────────

const GENERIC = new Set(["fim", "ate", "para", "inicio", "valor", "nº", "n°", "limite", "prazo de", "no prazo de", "em ate", "foro", "ramo", "multa", "vigente", "comeca", "encerra", "a partir de"]);

function aliasHits(c: Corpus, alias: string): { start: number; end: number; sep: boolean; generic: boolean }[] {
  const parts = alias.split(/\s+/).map(fold).filter(Boolean);
  if (parts.length === 0) return [];
  const generic = GENERIC.has(parts.join(" ")) || (parts.length === 1 && parts[0]!.length <= 3);
  const out: { start: number; end: number; sep: boolean; generic: boolean }[] = [];
  for (let i = 0; i + parts.length <= c.tokens.length; i++) {
    let ok = true;
    for (let k = 0; k < parts.length; k++) if (c.tokens[i + k]!.f !== parts[k]) ok = false;
    if (!ok) continue;
    let end = i + parts.length;
    const last = c.tokens[end - 1]!.t;
    let sep = /[:–—-]$/.test(last) || /^\($/.test(c.tokens[end]?.t ?? "");
    if (!sep && /^[:–—-]$/.test(c.tokens[end]?.t ?? "")) {
      sep = true;
      end++;
    }
    out.push({ start: i, end, sep, generic });
  }
  return out;
}

const FILLER = new Set(["de", "do", "da", "o", "a", "e", "em", "no", "na", "sera", "e:", "pagara", "pago", "total", "liquido", "valor", "as", "aos", "dia", "dias", "h", "24h", "00h", "partir", "ate", "um", "uma", "corresponde", "equivalente", "ao", "à", "a:", "por", "cento"]);

function within(c: Corpus, from: number, window: number, read: (i: number) => Hit | null): (Hit & { dist: number }) | null {
  const para = c.tokens[from]?.para;
  let dist = 0;
  for (let i = from; i < c.tokens.length && i - from < window; i++) {
    if (c.tokens[i]!.para !== para) break;
    const h = read(i);
    if (h) return { ...h, dist };
    if (!FILLER.has(c.tokens[i]!.f)) dist++;
  }
  return null;
}

function periodFrom(c: Corpus, j: number): (Hit & { dist: number }) | null {
  const a = within(c, j, 30, (i) => dateAt(c, i));
  if (!a) return null;
  const b = within(c, a.end, 24, (i) => dateAt(c, i));
  if (!b) return null;
  return { start: a.start, end: b.end, value: `${a.value} a ${b.value}`, start_iso: a.start_iso, end_iso: b.start_iso, dist: a.dist };
}

function idFrom(c: Corpus, j: number): (Hit & { dist: number }) | null {
  for (let i = j; i < Math.min(c.tokens.length, j + 3); i++) {
    const s = clean(c.tokens[i]!.t);
    if (/\d/.test(s) && /^[\p{L}\d][\p{L}\d./-]*$/u.test(s) && !dateAt(c, i)) return { start: i, end: i + 1, value: s, dist: i - j };
  }
  return null;
}

const DURATION = /^(dias?|meses|m[eê]s|anos?|horas?|semanas?)$/;

function textFrom(c: Corpus, j: number, sep: boolean): (Hit & { dist: number }) | null {
  const para = c.tokens[j]?.para;
  let end = j;
  for (let k = j; k < c.tokens.length && k - j < 12; k++) {
    const t = c.tokens[k]!;
    if (t.para !== para) break;
    end = k + 1;
    if (DURATION.test(t.f)) {
      if (["uteis", "corridos"].includes(c.tokens[k + 1]?.f ?? "")) end = k + 2;
      break;
    }
    if (/[.;,]$/.test(t.t) && !SUFFIX.test(t.t)) break;
  }
  if (end <= j) return null;
  const value = textOf(c, j, end).replace(/[.;,:]+$/, "");
  if (!sep && !/\d/.test(value)) return null; // rótulo sem ":" só vale se vier número ("no prazo de 30 dias")
  return value.length >= 2 ? { start: j, end, value, dist: 0 } : null;
}

// ─── Campos ─────────────────────────────────────────────────────────────

function evidence(c: Corpus, start: number, end: number): Evidence {
  const span = spanOf(c, start, end);
  const [s, e] = sentenceAround(c, start, end);
  return { page: span.page, text: span.text.replace(/[,;:]+$/, ""), context: textOf(c, s, e), rects: span.rects, from: span.from, to: span.to };
}

const empty = (def: FieldDef): FieldResult => ({ key: def.key, label: def.label, type: def.type, value: null, confidence: 0, source: "rule", evidence: null });

function confidence(dist: number, sep: boolean, generic: boolean) {
  const v = 0.97 - Math.min(dist, 8) * 0.04 + (sep ? 0.02 : 0) - (generic ? 0.12 : 0);
  return Math.max(0.5, Math.min(0.99, Math.round(v * 100) / 100));
}

function listField(c: Corpus, def: FieldDef): FieldResult {
  const items: FieldItem[] = [];
  const seen = new Set<string>();
  const push = (start: number, end: number, value: string) => {
    const key = `${c.tokens[start]!.page}:${fold(value)}`;
    if (seen.has(key) || items.length >= 20) return;
    seen.add(key);
    items.push({ value, evidence: evidence(c, start, end) });
  };
  const kind = def.aliases.includes("R$") ? "money" : def.aliases.includes("%") ? "percent" : "sentence";
  if (kind === "money" || kind === "percent") {
    for (let i = 0; i < c.tokens.length; i++) {
      const h = kind === "money" ? moneyAt(c, i) : percentAt(c, i);
      if (h) {
        push(h.start, h.end, h.value);
        i = h.end - 1;
      }
    }
  } else {
    const aliases = def.aliases.includes("é responsável") ? [...def.aliases, "assume o compromisso", "obriga-se a", "fica obrigada", "fica obrigado"] : def.aliases;
    const hits = aliases.flatMap((a) => aliasHits(c, a)).sort((a, b) => a.start - b.start);
    let lastEnd = -1;
    for (const h of hits) {
      const [s, e] = sentenceAround(c, h.start, h.end, 80);
      if (s < lastEnd) continue;
      lastEnd = e;
      const text = textOf(c, s, e);
      items.push({ value: text.length > 280 ? `${text.slice(0, 277)}…` : text, evidence: { ...evidence(c, s, e), text } });
      if (items.length >= 15) break;
    }
  }
  if (items.length === 0) return empty(def);
  return {
    ...empty(def),
    value: items.map((i) => i.value).join("\n"),
    items,
    confidence: kind === "sentence" ? 0.8 : 0.97,
    evidence: items[0]!.evidence,
  };
}

function currencyField(c: Corpus, def: FieldDef): FieldResult {
  for (const alias of def.aliases) {
    for (const h of aliasHits(c, alias)) {
      if (!h.sep) continue;
      const t = textFrom(c, h.end, true);
      if (t) {
        const code = /\b(BRL|USD|EUR|GBP)\b/i.exec(t.value)?.[1]?.toUpperCase() ?? CURRENCY_WORD[fold(t.value.split(/\s+/)[0] ?? "")];
        return { ...empty(def), value: code ? CURRENCY_NAME[code]! : t.value, currency: code, confidence: 0.95, evidence: evidence(c, t.start, t.end) };
      }
    }
  }
  // Sem rótulo "Moeda": deduz do primeiro valor monetário do documento (evidência = o símbolo).
  for (let i = 0; i < c.tokens.length; i++) {
    const m = moneyAt(c, i);
    if (m?.currency) return { ...empty(def), value: CURRENCY_NAME[m.currency]!, currency: m.currency, confidence: 0.75, evidence: evidence(c, m.start, m.end) };
  }
  return empty(def);
}

export function extractField(c: Corpus, def: FieldDef): FieldResult {
  if (def.type === "list") return listField(c, def);
  if (def.type === "currency") return currencyField(c, def);

  let best: { hit: Hit; conf: number } | null = null;
  // Rótulos mais longos primeiro ("valor do prêmio" antes de "prêmio").
  const aliases = [...def.aliases].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    for (const h of aliasHits(c, alias)) {
      let hit: (Hit & { dist: number }) | null = null;
      switch (def.type) {
        case "money":
          hit = within(c, h.end, 14, (i) => moneyAt(c, i));
          break;
        case "percent":
          hit = within(c, h.end, 14, (i) => percentAt(c, i));
          break;
        case "number":
          hit = within(c, h.end, 6, (i) => (RE_NUM.test(clean(c.tokens[i]!.t)) ? { start: i, end: i + 1, value: clean(c.tokens[i]!.t), amount: parseNumber(c.tokens[i]!.t) ?? undefined } : null));
          break;
        case "date":
          hit = within(c, h.end, 12, (i) => dateAt(c, i));
          break;
        case "period":
          hit = periodFrom(c, h.end);
          break;
        case "id":
          hit = idFrom(c, h.end);
          break;
        case "party": {
          if (h.sep) {
            const open = c.tokens[h.end]?.t === "(" ? h.end + 1 : h.end;
            const n = nameFrom(c, open);
            hit = n ? { ...n, dist: 0 } : null;
          } else {
            const n = (c.tokens[h.end]?.t.startsWith("(") ? nameFrom(c, h.end) : null) ?? nameBefore(c, h.start);
            hit = n ? { ...n, dist: 1 } : null;
          }
          break;
        }
        case "text":
          hit = h.sep || h.end - h.start > 1 ? textFrom(c, h.end, h.sep) : null;
          break;
      }
      if (!hit) continue;
      const conf = confidence(hit.dist, h.sep, h.generic);
      if (!best || conf > best.conf) best = { hit, conf };
    }
    if (best && best.conf >= 0.9) break;
  }
  if (!best) return empty(def);
  const { hit, conf } = best;
  return {
    ...empty(def),
    value: hit.value,
    amount: hit.amount,
    currency: hit.currency,
    start: hit.start_iso,
    end: hit.end_iso,
    confidence: conf,
    evidence: evidence(c, hit.start, hit.end),
  };
}

export function extractFields(c: Corpus, fields: FieldDef[]): FieldResult[] {
  return fields.map((def) => extractField(c, def));
}

/** Lê um valor digitado na correção manual, para manter números e datas comparáveis. */
export function interpretValue(type: FieldDef["type"], value: string): Partial<FieldResult> {
  const c: Corpus = {
    tokens: value.split(/\s+/).filter(Boolean).map((t) => ({ t, f: fold(t), page: 1, para: 0, eng: -1, x: 0, y: 0, w: 0, h: 0 })),
    paras: [[0, 0]],
    pageCount: 1,
  };
  c.paras[0]![1] = c.tokens.length;
  const scan = (read: (i: number) => Hit | null) => {
    for (let i = 0; i < c.tokens.length; i++) {
      const h = read(i);
      if (h) return h;
    }
    return null;
  };
  if (type === "money") {
    const h = scan((i) => moneyAt(c, i)) ?? (parseNumber(value) !== null ? { start: 0, end: 0, value, amount: parseNumber(value)!, currency: undefined } : null);
    return h ? { amount: h.amount, currency: h.currency } : {};
  }
  if (type === "percent" || type === "number") {
    const n = parseNumber(value.split(/[/\s]/)[0] ?? value);
    return n !== null ? { amount: n } : {};
  }
  if (type === "date") {
    const h = scan((i) => dateAt(c, i));
    return h ? { start: h.start_iso } : {};
  }
  if (type === "period") {
    const p = periodFrom(c, 0);
    return p ? { start: p.start_iso, end: p.end_iso } : {};
  }
  return {};
}
