import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPdf } from "../src/lib/processing/pdf";
import { compareDocuments } from "../src/lib/compare/engine";
import { buildCorpus } from "../src/lib/extract/corpus";
import { extractFields } from "../src/lib/extract/rules";
import { EXTRACTOR_TEMPLATES } from "../src/lib/extract/templates";
import { search } from "../src/lib/assist/retrieve";
import { buildSources, detectIntent, ruleAnswer, validateAiAnswer } from "../src/lib/assist/answer";
import { applyAiSummary, buildSummary, summaryFacts, summaryToMarkdown } from "../src/lib/assist/summaries";
import type { ComparisonContext, SourceDoc } from "../src/lib/assist/types";

const read = async (n: string) => extractPdf(new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url))));
const fields = EXTRACTOR_TEMPLATES[0]!.fields;

async function setup() {
  const [p1, p2] = [await read("contrato-v1.pdf"), await read("contrato-v2.pdf")];
  const r = compareDocuments(p1, p2);
  const docs: SourceDoc[] = [
    { versionId: "v1", title: "Contrato vs01", role: "base", corpus: buildCorpus(p1) },
    { versionId: "v2", title: "Contrato vs02", role: "revised", corpus: buildCorpus(p2) },
  ];
  for (const d of docs) d.fields = extractFields(d.corpus, fields);
  const cmp: ComparisonContext = {
    differencePercent: r.metrics.differencePercent,
    counts: r.metrics.changes,
    changes: r.changes.map((c) => ({
      position: c.position,
      type: c.type,
      relevant: c.relevant,
      baseText: c.base?.text || null,
      revisedText: c.revised?.text || null,
      basePage: c.base?.page ?? null,
      revisedPage: c.revised?.page ?? null,
      base: c.base ? { from: c.base.from, to: c.base.to, rects: c.base.rects } : null,
      revised: c.revised ? { from: c.revised.from, to: c.revised.to, rects: c.revised.rects } : null,
    })),
  };
  return { docs, cmp };
}

test("intenções das perguntas de exemplo do brief", () => {
  assert.equal(detectIntent("Quais foram as principais alterações?"), "changes");
  assert.equal(detectIntent("Quais cláusulas foram modificadas?"), "clauses");
  assert.equal(detectIntent("Houve mudança de valores?"), "values");
  assert.equal(detectIntent("Quais obrigações foram adicionadas?"), "obligations");
  assert.equal(detectIntent("Quais são os prazos relevantes?"), "deadlines");
  assert.equal(detectIntent("Existem divergências entre os documentos?"), "divergences");
  assert.equal(detectIntent("Resuma este contrato."), "summary");
});

test("busca encontra o trecho certo e cita página e retângulos", async () => {
  const { docs } = await setup();
  const [top] = search([docs[0]!], "qual o valor do prêmio?");
  assert.ok(top);
  const text = docs[0]!.corpus.tokens.slice(top.start, top.end).map((t) => t.t).join(" ");
  assert.match(text, /5\.111\.442,22/);
});

test("sem IA: alterações e valores vêm do motor, com citações dos dois lados", async () => {
  const { docs, cmp } = await setup();
  const v = ruleAnswer("Houve mudança de valores?", docs, cmp);
  assert.ok(v.found);
  assert.match(v.answer, /5\.111\.442,22.*5\.400\.000,00/);
  assert.ok(v.citations.some((c) => c.versionId === "v1") && v.citations.some((c) => c.versionId === "v2"));
  const ob = ruleAnswer("Quais obrigações foram adicionadas?", docs, cmp);
  assert.match(ob.answer, /Sigilo|manterão sigilo/);
  const none = ruleAnswer("Qual é a cor do navio?", docs, cmp);
  assert.equal(none.found, false);
  assert.equal(none.citations.length, 0);
});

test("modo IA: citações inexistentes são descartadas; sem evidência vira 'não encontrei'", async () => {
  const { docs, cmp } = await setup();
  const sources = buildSources("Qual o prêmio?", docs, cmp);
  const money = sources.find((s) => s.id.startsWith("C") && s.text.includes("5.400.000,00"))!;
  assert.ok(money, "alteração de valor entre as fontes");
  const ok = validateAiAnswer({ answer: `O prêmio passou para R$ 5.400.000,00 [${money.id}] [S99].`, citations: [money.id, "S99"], found: true }, sources);
  assert.ok(ok.found);
  assert.ok(!ok.answer.includes("S99"));
  assert.equal(ok.citations.length, 2); // original e revisado
  const bad = validateAiAnswer({ answer: "O prêmio é R$ 10 milhões.", citations: ["S42"], found: true }, sources);
  assert.equal(bad.found, false);
  assert.equal(bad.citations.length, 0);
});

test("resumos determinísticos com evidência e exportação", async () => {
  const { docs, cmp } = await setup();
  const changes = buildSummary("changes", docs, cmp);
  assert.ok(changes.disclaimer);
  assert.ok(changes.sections.find((s) => s.heading === "Potencialmente relevantes")!.items.every((i) => i.citations.length > 0));
  assert.equal(buildSummary("changes", docs).notice?.startsWith("O resumo de alterações precisa"), true);
  const contract = buildSummary("contract", [docs[1]!]);
  const md = summaryToMarkdown(contract, [docs[1]!]);
  assert.match(md, /Prêmio: R\$ 5\.400\.000,00/);
  assert.match(md, /Contratante: Não identificado/);
  const fin = buildSummary("financial", docs, cmp);
  assert.ok(fin.sections.some((s) => s.items.some((i) => /\+5,65%/.test(i.text))));
  const risks = buildSummary("risks", docs, cmp);
  assert.ok(risks.sections.some((s) => s.heading === "Confidencialidade"));
  const exec = buildSummary("executive", docs, cmp);
  assert.ok(exec.sections.length >= 2);
  // IA só pode reescrever fatos existentes
  const facts = summaryFacts(contract);
  const ai = applyAiSummary(contract, facts, { sections: [{ heading: "Partes", items: [{ text: "Cedente e broker identificados.", facts: ["F3", "F99"] }, { text: "Inventado", facts: [] }] }] });
  assert.equal(ai!.sections[0]!.items.length, 1);
  assert.equal(ai!.generatedBy, "ia");
});
