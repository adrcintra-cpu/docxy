import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDocuments } from "../src/lib/compare/engine";
import type { PageText, Word } from "../src/lib/compare/types";

/** Monta páginas a partir de parágrafos, com coordenadas fictícias por linha. */
function pages(...paras: string[]): PageText[] {
  const words: Word[] = [];
  let line = 0;
  for (const para of paras) {
    para.split(/\s+/).forEach((t, i) => {
      const col = i % 12;
      if (col === 0) line++;
      words.push({ t, x: 0.1 + col * 0.06, y: 0.05 + line * 0.02, w: 0.05, h: 0.015, ...(col === 0 ? { lb: 1 as const } : {}), ...(i === 0 ? { pb: 1 as const } : {}) });
    });
  }
  return [{ page: 1, width: 595, height: 842, words }];
}

const P1 = "Segurança, Pontualidade e Eficiência no Transporte: A CONTRATADA assume o compromisso de transportar as mercadorias da CONTRATANTE com a máxima diligência.";
const P2 = "Cumprimento de Prazos: A CONTRATADA é responsável por cumprir rigorosamente os prazos acordados para todas as etapas do transporte.";
const P3 = "Pagamento Integral e Pontual: o prazo para quitação é de 30 (trinta) dias após a apresentação da fatura pela CONTRATADA.";
const P4 = "Valor do prêmio: R$ 5.111.442,22 a ser pago em parcela única.";
const P5 = "Vigência: início às 24h do dia 31/03/2023 e fim às 24h do dia 31/03/2024.";

test("documentos iguais não têm diferenças", () => {
  const r = compareDocuments(pages(P1, P2, P3), pages(P1, P2, P3));
  assert.equal(r.changes.length, 0);
  assert.equal(r.metrics.differencePercent, 0);
  assert.equal(r.metrics.words.equal, r.metrics.words.baseTotal);
});

test("troca de número vira NUMBER_CHANGED com os dois trechos", () => {
  const r = compareDocuments(pages(P1, P3), pages(P1, P3.replace("30 (trinta)", "45 (quarenta e cinco)")));
  assert.equal(r.changes.length, 1);
  const c = r.changes[0]!;
  assert.ok(["NUMBER_CHANGED", "REPLACED"].includes(c.type), c.type);
  assert.match(c.base!.text, /30/);
  assert.match(c.revised!.text, /45/);
  assert.ok(c.base!.rects.length > 0, "tem coordenadas");
});

test("valor monetário e data são classificados", () => {
  const r = compareDocuments(pages(P4, P5), pages(P4.replace("5.111.442,22", "5.400.000,00"), P5.replace("31/03/2024", "30/06/2024")));
  const types = r.changes.map((c) => c.type).sort();
  assert.deepEqual(types, ["DATE_CHANGED", "MONEY_CHANGED"]);
  assert.ok(r.changes.every((c) => c.relevant));
});

test("mudança só de pontuação/caixa é FORMATTING e não conta como palavra alterada", () => {
  const r = compareDocuments(pages(P2), pages(P2.replace("rigorosamente", "Rigorosamente,")));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0]!.type, "FORMATTING");
  assert.equal(r.metrics.differencePercent, 0);
});

test("parágrafo que mudou de lugar é MOVED, não remoção + inserção", () => {
  const r = compareDocuments(pages(P1, P2, P3, P4), pages(P1, P3, P4, P2));
  assert.equal(r.changes.filter((c) => c.type === "MOVED").length, 1);
  assert.equal(r.changes.filter((c) => c.type === "REMOVED" || c.type === "INSERTED").length, 0);
});

test("inserção e remoção de parágrafos inteiros", () => {
  const r = compareDocuments(pages(P1, P2, P3), pages(P1, P3, P5));
  const kinds = r.changes.map((c) => c.type);
  assert.ok(kinds.includes("REMOVED"), kinds.join());
  assert.ok(kinds.includes("INSERTED"), kinds.join());
  assert.ok(r.metrics.words.removed > 0 && r.metrics.words.inserted > 0);
});

test("palavra inserida no meio do parágrafo", () => {
  const r = compareDocuments(pages(P2), pages(P2.replace("os prazos acordados", "os prazos expressamente acordados")));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0]!.type, "INSERTED");
  assert.equal(r.changes[0]!.revised!.text, "expressamente");
  assert.equal(r.metrics.words.inserted, 1);
});

test("hifenização no fim da linha não gera diferença", () => {
  const a = pages(P2);
  const b = pages(P2);
  // "responsável" quebrado em "respon-" + "sável" na linha seguinte
  const i = b[0]!.words.findIndex((w) => w.t === "responsável");
  b[0]!.words.splice(i, 1, { ...b[0]!.words[i]!, t: "respon-" }, { ...b[0]!.words[i]!, t: "sável", lb: 1 });
  assert.equal(compareDocuments(a, b).changes.length, 0);
});

test("métrica segue a fórmula documentada", () => {
  const r = compareDocuments(pages(P2), pages(P2.replace("rigorosamente ", "")));
  const w = r.metrics.words;
  const expected = Math.round(((w.inserted + w.removed + w.replaced) / (w.equal + w.inserted + w.removed + w.replaced)) * 10000) / 100;
  assert.equal(r.metrics.differencePercent, expected);
  assert.equal(w.removed, 1);
});

test("parágrafo reescrito vira uma alteração de parágrafo", () => {
  const r = compareDocuments(pages(P1, P2), pages(P1, "Prazos: a transportadora deverá observar o cronograma informado pela contratante em cada ordem de serviço emitida."));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0]!.type, "PARAGRAPH_CHANGED");
});

test("resultado é determinístico", () => {
  const a = pages(P1, P2, P3, P4, P5);
  const b = pages(P1, P3.replace("30", "60"), P2, P4.replace("única", "dupla"), P5);
  assert.deepEqual(compareDocuments(a, b), compareDocuments(a, b));
});
