import { myers } from "./diff";
import {
  looseForm,
  normalizeToken,
  RE_CLAUSE,
  RE_DATE,
  RE_ENTITY,
  RE_MONEY,
  RE_NUMBER,
  RE_PERCENT,
  withoutNumbers,
} from "./normalize";
import { changeGroup, type Change, type ChangeSide, type ChangeType, type CompareResult, type PageText, type Rect } from "./types";

/**
 * Motor de comparação determinístico.
 *
 *  1. extração        → recebe as páginas com palavras e coordenadas (src/lib/processing)
 *  2. normalização    → normalizeToken (Unicode/tipografia; conteúdo intacto)
 *  3. segmentação     → páginas → parágrafos → palavras
 *  4. alinhamento     → diff de Myers sobre parágrafos; pares de parágrafos parecidos
 *  5. diferenças      → diff de Myers sobre palavras dentro de cada par
 *  6. coordenadas     → retângulos por linha a partir das caixas das palavras
 *  7. classificação   → números, datas, valores, nomes, cláusulas, formatação, movidos
 *  8. persistência    → feita por quem chama (src/app/actions/compare.ts)
 *
 * O resultado é reproduzível: a mesma entrada e a mesma ENGINE_VERSION dão sempre
 * as mesmas alterações. A IA (Fase 4) só acrescenta rótulos; nunca altera estes dados.
 */
export const ENGINE_VERSION = "docxy-compare/1.0.0";

interface Token {
  text: string; // original
  key: string; // normalizado
  page: number;
  para: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Paragraph {
  start: number; // índice do primeiro token
  end: number; // exclusivo
  key: string;
}

interface Doc {
  tokens: Token[];
  paras: Paragraph[];
}

/**
 * Para cada palavra de cada página, o índice do token correspondente no motor
 * (palavras hifenizadas juntadas apontam para o mesmo token; vazias = -1).
 * O visualizador usa isto para destacar trechos de DOCX, que não têm coordenadas.
 */
export function wordTokenIndex(pages: PageText[]): number[][] {
  return tokenize(pages).map;
}

/** Junta palavras hifenizadas no fim da linha ("contra-" + "tada" → "contratada"). */
function tokenize(pages: PageText[]): Doc & { map: number[][] } {
  const tokens: Token[] = [];
  const paras: Paragraph[] = [];
  let para = -1;
  const openPara = () => {
    if (para >= 0) paras[para]!.end = tokens.length;
    para++;
    paras.push({ start: tokens.length, end: tokens.length, key: "" });
  };
  const map: number[][] = [];
  for (const page of pages) {
    const pageMap: number[] = [];
    map.push(pageMap);
    for (let i = 0; i < page.words.length; i++) {
      const w = page.words[i]!;
      const text = w.t.trim();
      if (!text) {
        pageMap.push(-1);
        continue;
      }
      if (para < 0 || w.pb) openPara();
      const prev = tokens[tokens.length - 1];
      if (prev && w.lb && !w.pb && prev.para === para && /[\p{L}]-$/u.test(prev.text) && /^\p{Ll}/u.test(text)) {
        prev.text = prev.text.slice(0, -1) + text;
        prev.key = normalizeToken(prev.text);
        pageMap.push(tokens.length - 1);
        continue;
      }
      pageMap.push(tokens.length);
      tokens.push({ text, key: normalizeToken(text), page: page.page, para, x: w.x, y: w.y, w: w.w, h: w.h });
    }
  }
  if (para >= 0) paras[para]!.end = tokens.length;
  for (const p of paras) p.key = tokens.slice(p.start, p.end).map((t) => t.key).join(" ");
  return { tokens, paras: paras.filter((p) => p.end > p.start), map };
}

/** Semelhança entre dois parágrafos (Dice sobre o multiconjunto de palavras). */
function similarity(a: Doc, pa: Paragraph, b: Doc, pb: Paragraph): number {
  const count = new Map<string, number>();
  for (let i = pa.start; i < pa.end; i++) {
    const k = looseForm(a.tokens[i]!.key);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let common = 0;
  for (let i = pb.start; i < pb.end; i++) {
    const k = looseForm(b.tokens[i]!.key);
    const c = count.get(k) ?? 0;
    if (c > 0) {
      common++;
      count.set(k, c - 1);
    }
  }
  return (2 * common) / (pa.end - pa.start + (pb.end - pb.start));
}

function rectsFor(doc: Doc, from: number, to: number): Rect[] {
  const rects: Rect[] = [];
  for (let i = from; i < to; i++) {
    const t = doc.tokens[i]!;
    if (t.w <= 0) continue; // DOCX: sem coordenadas, o visualizador destaca pelo índice
    const last = rects[rects.length - 1];
    if (last && last.page === t.page && Math.abs(last.y - t.y) < t.h * 0.6 && t.x >= last.x) {
      const right = Math.max(last.x + last.w, t.x + t.w);
      last.y = Math.min(last.y, t.y);
      last.h = Math.max(last.h, t.h);
      last.w = right - last.x;
    } else rects.push({ page: t.page, x: t.x, y: t.y, w: t.w, h: t.h });
  }
  return rects.map((r) => ({ page: r.page, x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
}

const round = (n: number) => Math.round(n * 10000) / 10000;

function side(doc: Doc, from: number, to: number, anchor?: number): ChangeSide {
  // Inserção pura: o lado sem texto aponta para a posição onde o trecho entraria.
  const at = Math.min(Math.max(anchor ?? from, 0), Math.max(doc.tokens.length - 1, 0));
  const page = doc.tokens[from]?.page ?? doc.tokens[at]?.page ?? 1;
  return {
    page,
    from,
    to,
    text: doc.tokens.slice(from, to).map((t) => t.text).join(" "),
    rects: from < to ? rectsFor(doc, from, to) : rectsFor(doc, at, Math.min(at + 1, doc.tokens.length)).map((r) => ({ ...r, w: 0.004 })),
  };
}

function context(doc: Doc, from: number, to: number) {
  const before = doc.tokens.slice(Math.max(0, from - 10), from).map((t) => t.text).join(" ");
  const after = doc.tokens.slice(to, to + 10).map((t) => t.text).join(" ");
  return { before, after };
}

/** Classifica uma substituição pelo que mudou. */
function classifyReplace(baseText: string, revText: string, paraText: string, before = ""): ChangeType {
  if (looseForm(baseText) === looseForm(revText)) return "FORMATTING";
  const both = (re: RegExp) => re.test(baseText) && re.test(revText);
  // "R$" costuma ficar fora do trecho alterado (é igual nos dois lados): olha a palavra anterior.
  if (both(RE_MONEY) || (RE_NUMBER.test(baseText) && RE_NUMBER.test(revText) && RE_MONEY.test(`${before} ${baseText}`) && RE_MONEY.test(`${before} ${revText}`))) return "MONEY_CHANGED";
  if (both(RE_DATE)) return "DATE_CHANGED";
  if ((both(RE_NUMBER) || both(RE_PERCENT)) && withoutNumbers(baseText) === withoutNumbers(revText)) return "NUMBER_CHANGED";
  if (both(RE_NUMBER) && baseText.split(" ").length <= 3 && revText.split(" ").length <= 3) return "NUMBER_CHANGED";
  if (both(RE_ENTITY) || (isProperName(baseText) && isProperName(revText))) return "ENTITY_CHANGED";
  if (RE_CLAUSE.test(paraText)) return "CLAUSE_MODIFIED";
  return "REPLACED";
}

function isProperName(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6 && words.every((w) => /^[\p{Lu}][\p{L}.&'-]*$/u.test(w) || /^(de|da|do|dos|das|e)$/i.test(w));
}

function isRelevant(type: ChangeType, words: number) {
  if (type === "FORMATTING" || type === "MOVED") return false;
  if (["MONEY_CHANGED", "DATE_CHANGED", "NUMBER_CHANGED", "CLAUSE_MODIFIED", "ENTITY_CHANGED", "PARAGRAPH_CHANGED"].includes(type)) return true;
  return words >= 8;
}

export function compareDocuments(basePages: PageText[], revisedPages: PageText[]): CompareResult {
  const A = tokenize(basePages);
  const B = tokenize(revisedPages);
  const out: Omit<Change, "position">[] = [];
  const words = { equal: 0, inserted: 0, removed: 0, replaced: 0 };

  const paraOps = myers(
    A.paras.map((p) => p.key),
    B.paras.map((p) => p.key),
  );

  // Parágrafos inteiros removidos/inseridos ficam pendentes para a detecção de movidos.
  const lonelyRemoved: number[] = [];
  const lonelyInserted: number[] = [];

  const emitWordDiff = (pa: Paragraph, pb: Paragraph) => {
    const ops = myers(
      A.tokens.slice(pa.start, pa.end).map((t) => t.key),
      B.tokens.slice(pb.start, pb.end).map((t) => t.key),
    );
    const changed = ops.filter((o) => o.kind !== "equal").reduce((n, o) => n + Math.max(o.a1 - o.a0, o.b1 - o.b0), 0);
    const size = Math.max(pa.end - pa.start, pb.end - pb.start);
    const paraText = A.tokens.slice(pa.start, Math.min(pa.end, pa.start + 6)).map((t) => t.text).join(" ");

    // Parágrafo reescrito em mais da metade: uma alteração só, mais legível que dezenas de pedaços.
    if (size >= 12 && changed / size > 0.5) {
      const a = side(A, pa.start, pa.end);
      const b = side(B, pb.start, pb.end);
      const eq = ops.filter((o) => o.kind === "equal").reduce((n, o) => n + (o.a1 - o.a0), 0);
      words.equal += eq;
      words.replaced += pa.end - pa.start - eq;
      words.inserted += Math.max(0, pb.end - pb.start - (pa.end - pa.start));
      const ctx = context(A, pa.start, pa.end);
      out.push({ type: RE_CLAUSE.test(paraText) ? "CLAUSE_MODIFIED" : "PARAGRAPH_CHANGED", base: a, revised: b, contextBefore: ctx.before, contextAfter: ctx.after, relevant: true });
      return;
    }

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      const a0 = pa.start + op.a0, a1 = pa.start + op.a1, b0 = pb.start + op.b0, b1 = pb.start + op.b1;
      if (op.kind === "equal") {
        words.equal += a1 - a0;
        continue;
      }
      // delete seguido de insert (ou vice-versa) = substituição
      const next = ops[i + 1];
      if (next && next.kind !== "equal" && next.kind !== op.kind) {
        const na0 = pa.start + next.a0, na1 = pa.start + next.a1, nb0 = pb.start + next.b0, nb1 = pb.start + next.b1;
        const from = Math.min(a0, na0), to = Math.max(a1, na1), rfrom = Math.min(b0, nb0), rto = Math.max(b1, nb1);
        const base = side(A, from, to);
        const revised = side(B, rfrom, rto);
        const before = A.tokens.slice(Math.max(pa.start, from - 2), from).map((t) => t.text).join(" ");
        const type = classifyReplace(base.text, revised.text, paraText, before);
        if (type === "FORMATTING") words.equal += to - from;
        else {
          words.replaced += to - from;
          words.inserted += Math.max(0, rto - rfrom - (to - from));
        }
        const ctx = context(A, from, to);
        out.push({ type, base, revised, contextBefore: ctx.before, contextAfter: ctx.after, relevant: isRelevant(type, Math.max(to - from, rto - rfrom)) });
        i++;
        continue;
      }
      if (op.kind === "delete") {
        words.removed += a1 - a0;
        const ctx = context(A, a0, a1);
        out.push({ type: "REMOVED", base: side(A, a0, a1), revised: side(B, b0, b0, b0), contextBefore: ctx.before, contextAfter: ctx.after, relevant: isRelevant("REMOVED", a1 - a0) });
      } else {
        words.inserted += b1 - b0;
        const ctx = context(B, b0, b1);
        out.push({ type: "INSERTED", base: side(A, a0, a0, a0), revised: side(B, b0, b1), contextBefore: ctx.before, contextAfter: ctx.after, relevant: isRelevant("INSERTED", b1 - b0) });
      }
    }
  };

  // 1) Separa os blocos de diferença entre parágrafos iguais.
  const blocks: { dels: number[]; ins: number[] }[] = [];
  for (let i = 0; i < paraOps.length; i++) {
    const op = paraOps[i]!;
    if (op.kind === "equal") {
      for (let p = op.a0; p < op.a1; p++) words.equal += A.paras[p]!.end - A.paras[p]!.start;
      continue;
    }
    const block = { dels: [] as number[], ins: [] as number[] };
    while (i < paraOps.length && paraOps[i]!.kind !== "equal") {
      const o = paraOps[i]!;
      for (let p = o.a0; p < o.a1; p++) block.dels.push(p);
      for (let p = o.b0; p < o.b1; p++) block.ins.push(p);
      i++;
    }
    i--;
    blocks.push(block);
  }

  // 2) Movidos: parágrafo removido num lugar e inserido idêntico em outro não é remoção + inserção.
  //    No mesmo bloco, só conta como movido se o texto for idêntico (senão é formatação).
  const insByKey = new Map<string, { n: number; block: number }[]>();
  blocks.forEach((bl, bi) => {
    for (const n of bl.ins) {
      const k = looseForm(B.paras[n]!.key);
      insByKey.set(k, [...(insByKey.get(k) ?? []), { n, block: bi }]);
    }
  });
  const movedDel = new Set<number>();
  const movedIns = new Set<number>();
  for (const [bi, bl] of blocks.entries()) {
    for (const d of bl.dels) {
      const n = insByKey
        .get(looseForm(A.paras[d]!.key))
        ?.find((c) => !movedIns.has(c.n) && (c.block !== bi || B.paras[c.n]!.key === A.paras[d]!.key))?.n;
      if (n === undefined) continue;
      movedDel.add(d);
      movedIns.add(n);
      const pa = A.paras[d]!, pb = B.paras[n]!;
      words.equal += pa.end - pa.start;
      const ctx = context(A, pa.start, pa.end);
      out.push({ type: "MOVED", base: side(A, pa.start, pa.end), revised: side(B, pb.start, pb.end), contextBefore: ctx.before, contextAfter: ctx.after, relevant: false });
    }
  }

  // 3) Em cada bloco, emparelha na ordem parágrafos parecidos e compara palavra a palavra.
  for (const bl of blocks) {
    const dels = bl.dels.filter((d) => !movedDel.has(d));
    const ins = bl.ins.filter((n) => !movedIns.has(n));
    const pairedIns = new Set<number>();
    const unpairedDels: number[] = [];
    let cursor = 0;
    for (const d of dels) {
      let best = -1;
      let bestScore = 0.45;
      for (let k = cursor; k < ins.length; k++) {
        const sc = similarity(A, A.paras[d]!, B, B.paras[ins[k]!]!);
        if (sc > bestScore) {
          bestScore = sc;
          best = k;
        }
      }
      if (best < 0) {
        unpairedDels.push(d);
        continue;
      }
      pairedIns.add(ins[best]!);
      emitWordDiff(A.paras[d]!, B.paras[ins[best]!]!);
      cursor = best + 1;
    }
    let leftIns = ins.filter((n) => !pairedIns.has(n));
    // Sobrou o mesmo número dos dois lados no mesmo lugar: é o parágrafo reescrito.
    if (unpairedDels.length > 0 && unpairedDels.length === leftIns.length) {
      for (let k = 0; k < unpairedDels.length; k++) emitWordDiff(A.paras[unpairedDels[k]!]!, B.paras[leftIns[k]!]!);
      unpairedDels.length = 0;
      leftIns = [];
    }
    for (const d of unpairedDels) lonelyRemoved.push(d);
    for (const n of leftIns) lonelyInserted.push(n);
  }

  for (const d of lonelyRemoved) {
    const pa = A.paras[d]!;
    words.removed += pa.end - pa.start;
    const anchor = nearestRevisedAnchor(B, A, pa.start);
    const ctx = context(A, pa.start, pa.end);
    out.push({ type: "REMOVED", base: side(A, pa.start, pa.end), revised: side(B, anchor, anchor, anchor), contextBefore: ctx.before, contextAfter: ctx.after, relevant: isRelevant("REMOVED", pa.end - pa.start) });
  }
  for (const n of lonelyInserted) {
    const pb = B.paras[n]!;
    words.inserted += pb.end - pb.start;
    const anchor = Math.round((pb.start / Math.max(B.tokens.length, 1)) * A.tokens.length);
    const ctx = context(B, pb.start, pb.end);
    out.push({ type: "INSERTED", base: side(A, anchor, anchor, anchor), revised: side(B, pb.start, pb.end), contextBefore: ctx.before, contextAfter: ctx.after, relevant: isRelevant("INSERTED", pb.end - pb.start) });
  }

  // Ordem de leitura pelo documento original (inserções pela posição de ancoragem).
  out.sort((x, y) => (x.base?.from ?? 0) - (y.base?.from ?? 0) || (x.revised?.from ?? 0) - (y.revised?.from ?? 0));
  const changes: Change[] = out.map((c, i) => ({ ...c, position: i + 1 }));

  const groups = { inserted: 0, removed: 0, replaced: 0, moved: 0, formatting: 0 };
  for (const c of changes) groups[changeGroup(c.type)]++;
  const changedWords = words.inserted + words.removed + words.replaced;
  const denominator = words.equal + changedWords;

  return {
    changes,
    metrics: {
      engineVersion: ENGINE_VERSION,
      changes: { ...groups, total: changes.length },
      words: { ...words, baseTotal: A.tokens.length, revisedTotal: B.tokens.length },
      differencePercent: denominator === 0 ? 0 : Math.round((changedWords / denominator) * 10000) / 100,
      formula:
        "percentual = (palavras inseridas + removidas + substituídas) ÷ (palavras iguais + inseridas + removidas + substituídas) × 100. " +
        "Substituídas contam pelo lado original; movidos e formatação contam como iguais.",
    },
  };
}

/** Posição aproximada, no revisado, de um trecho que só existe no original. */
function nearestRevisedAnchor(B: Doc, A: Doc, aIndex: number) {
  return Math.min(B.tokens.length, Math.round((aIndex / Math.max(A.tokens.length, 1)) * B.tokens.length));
}
