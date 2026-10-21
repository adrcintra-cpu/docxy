import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPdf } from "../src/lib/processing/pdf";
import { compareDocuments } from "../src/lib/compare/engine";

const v1 = new Uint8Array(readFileSync(new URL("./fixtures/contrato-v1.pdf", import.meta.url)));
const v2 = new Uint8Array(readFileSync(new URL("./fixtures/contrato-v2.pdf", import.meta.url)));

test("extrai palavras com coordenadas e parágrafos de um PDF", async () => {
  const pages = await extractPdf(v1);
  assert.equal(pages.length, 1);
  const words = pages[0]!.words;
  assert.ok(words.length > 150, `palavras: ${words.length}`);
  assert.equal(words[0]!.t, "CONTRATO");
  const paras = words.filter((w) => w.pb).length;
  assert.equal(paras, 7, `parágrafos: ${paras}`);
  for (const w of words) {
    assert.ok(w.x >= 0 && w.x < 1 && w.y >= 0 && w.y < 1 && w.w > 0 && w.h > 0, JSON.stringify(w));
  }
  assert.ok(words.some((w) => w.t === "R$") && words.some((w) => w.t === "5.111.442,22"));
});

test("compara duas versões reais de contrato", async () => {
  const r = compareDocuments(await extractPdf(v1), await extractPdf(v2));
  const byType = (t: string) => r.changes.filter((c) => c.type === t);
  assert.equal(byType("MONEY_CHANGED").length, 1, JSON.stringify(r.changes.map((c) => [c.type, c.base?.text, c.revised?.text])));
  assert.equal(byType("DATE_CHANGED").length, 1);
  assert.equal(byType("MOVED").length, 1);
  assert.ok(byType("INSERTED").some((c) => /Sigilo/.test(c.revised!.text)));
  assert.ok(r.changes.some((c) => /45/.test(c.revised?.text ?? "")));
  for (const c of r.changes) assert.ok((c.base?.rects.length ?? 0) + (c.revised?.rects.length ?? 0) > 0, `sem retângulos: ${c.type}`);
  assert.ok(r.metrics.differencePercent > 0 && r.metrics.differencePercent < 30, String(r.metrics.differencePercent));
});
