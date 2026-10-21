import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPdf } from "../src/lib/processing/pdf";
import { buildCorpus, locateQuote } from "../src/lib/extract/corpus";
import { extractFields, parseNumber } from "../src/lib/extract/rules";
import { mergeAiFields } from "../src/lib/extract/ai";
import { compareExtractions } from "../src/lib/extract/compare";
import { EXTRACTOR_TEMPLATES } from "../src/lib/extract/templates";
import { pagesFromText } from "./helpers/pages";

const contratos = EXTRACTOR_TEMPLATES.find((t) => t.template === "contratos")!;
const apolices = EXTRACTOR_TEMPLATES.find((t) => t.template === "apolices")!;
const pdf = async (name: string) => buildCorpus(await extractPdf(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))));
const byKey = (fields: ReturnType<typeof extractFields>) => Object.fromEntries(fields.map((f) => [f.key, f]));

test("números em formato brasileiro e inglês", () => {
  assert.equal(parseNumber("5.111.442,22"), 5111442.22);
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("5.000"), 5000);
  assert.equal(parseNumber("41,5"), 41.5);
});

test("extrai os campos do contrato real com evidência e não inventa os ausentes", async () => {
  const f = byKey(extractFields(await pdf("contrato-v1.pdf"), contratos.fields));
  assert.equal(f.numero!.value, "001/2022");
  assert.equal(f.cedente!.value, "Pottencial Seguradora S.A.");
  assert.equal(f.broker!.value, "IRB-Brasil Resseguros S.A.");
  assert.equal(f.premio!.value, "R$ 5.111.442,22");
  assert.equal(f.premio!.amount, 5111442.22);
  assert.equal(f.moeda!.currency, "BRL");
  assert.equal(f.vigencia!.start, "2023-03-31");
  assert.equal(f.vigencia!.end, "2024-03-31");
  assert.equal(f.inicio!.start, "2023-03-31");
  assert.equal(f.termino!.start, "2024-03-31");
  assert.equal(f.prazo_pagamento!.value, "30 (trinta) dias");
  assert.equal(f.obrigacoes!.items!.length, 3);
  // ausentes ficam em branco ("Não identificado")
  for (const k of ["contratante", "contratada", "comissao", "percentuais"]) {
    assert.equal(f[k]!.value, null, k);
    assert.equal(f[k]!.evidence, null, k);
  }
  // toda evidência aponta para a página e tem retângulo
  for (const x of Object.values(f)) if (x.value) assert.ok(x.evidence && x.evidence.page === 1 && x.evidence.rects.length > 0, x.key);
});

test("qualificação das partes, comissão e moeda declarada", () => {
  const c = buildCorpus(
    pagesFromText(`CONTRATO DE CORRETAGEM Nº CT-2024/118

De um lado, ACME LOGÍSTICA LTDA., inscrita no CNPJ sob nº 12.345.678/0001-90, doravante denominada CONTRATANTE; e, de outro lado, Mar Azul Transportes S.A., doravante denominada CONTRATADA.

Moeda: Dólar americano (USD). O prêmio líquido será de US$ 1.250.000,00 e a comissão de corretagem de 12,5% sobre o prêmio.

Vigência de 1º de janeiro de 2025 a 31 de dezembro de 2025.

A CONTRATADA obriga-se a manter seguro de responsabilidade civil durante toda a vigência.`),
  );
  const f = byKey(extractFields(c, contratos.fields));
  assert.equal(f.numero!.value, "CT-2024/118");
  assert.equal(f.contratante!.value, "ACME LOGÍSTICA LTDA.");
  assert.equal(f.contratada!.value, "Mar Azul Transportes S.A.");
  assert.equal(f.moeda!.currency, "USD");
  assert.equal(f.premio!.amount, 1250000);
  assert.equal(f.premio!.currency, "USD");
  assert.equal(f.comissao!.value, "12,5%");
  assert.equal(f.comissao!.amount, 12.5);
  assert.equal(f.vigencia!.start, "2025-01-01");
  assert.equal(f.vigencia!.end, "2025-12-31");
  assert.ok(f.obrigacoes!.items![0]!.value.startsWith("A CONTRATADA obriga-se"));
});

test("modelo de apólices reaproveita os mesmos campos", async () => {
  const f = byKey(extractFields(await pdf("contrato-v2.pdf"), apolices.fields));
  assert.equal(f.premio!.amount, 5400000);
  assert.equal(f.vigencia!.end, "2024-06-30");
  assert.equal(f.lob!.value, null);
});

test("IA só preenche campo vazio quando o trecho citado existe e contém o valor", async () => {
  const c = await pdf("contrato-v1.pdf");
  const fields = extractFields(c, contratos.fields);
  const res = mergeAiFields(c, contratos.fields, fields, {
    fields: [
      { key: "contratante", value: "Empresa Multinacional ABC", quote: "A CONTRATANTE pagará o prêmio", page: 1 }, // valor não está no trecho
      { key: "contratada", value: "Navegação XYZ", quote: "Navegação XYZ Ltda. é a contratada", page: 1 }, // trecho inexistente
      { key: "comissao", value: "30", quote: "no prazo de 30 (trinta) dias", page: 1 }, // existe e contém o valor → aceito
      { key: "premio", value: "R$ 1,00", quote: "R$ 5.111.442,22", page: 1 }, // já preenchido por regra → ignorado
    ],
  });
  const f = byKey(res.fields);
  assert.equal(f.contratante!.value, null);
  assert.equal(f.contratada!.value, null);
  assert.equal(f.premio!.value, "R$ 5.111.442,22");
  assert.equal(f.comissao!.source, "ai");
  assert.equal(res.accepted, 1);
  assert.equal(res.rejected, 2);
  assert.ok(locateQuote(c, "pagará o prêmio de R$ 5.111.442,22"));
  assert.equal(locateQuote(c, "pagará o prêmio de R$ 9,00"), null);
});

test("dashboard: iguais, alterados, ausentes e variação real", async () => {
  const [a, b] = [extractFields(await pdf("contrato-v1.pdf"), contratos.fields), extractFields(await pdf("contrato-v2.pdf"), contratos.fields)];
  const d = compareExtractions(a, b, new Set(contratos.fields.filter((x) => x.important).map((x) => x.key)));
  const s = Object.fromEntries(d.fields.map((x) => [x.key, x]));
  assert.equal(s.numero!.status, "equal");
  assert.equal(s.cedente!.status, "equal");
  assert.equal(s.premio!.status, "changed");
  assert.equal(s.premio!.variation, 5.65);
  assert.ok(s.premio!.relevant);
  assert.equal(s.vigencia!.status, "changed");
  assert.equal(s.vigencia!.daysDelta, 91);
  assert.equal(s.comissao!.status, "missing");
  assert.equal(s.obrigacoes!.status, "changed"); // a cláusula 2 mudou de redação
  assert.equal(d.counts.changed, 6); // prêmio, vigência, término, prazo de pagamento, obrigações, valores citados
});
