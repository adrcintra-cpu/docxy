import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractDocx } from "../src/lib/processing/docx";

test("extrai parágrafos, quebras e entidades de um DOCX", async () => {
  const pages = await extractDocx(new Uint8Array(readFileSync(new URL("./fixtures/curto.docx", import.meta.url))));
  const words = pages[0]!.words;
  assert.equal(words.filter((w) => w.pb).length, 3);
  assert.ok(words.some((w) => w.t === "&"));
  assert.ok(words.some((w) => w.t === "quebrada" && w.lb && !w.pb));
  assert.equal(words.map((w) => w.t).join(" "), "Cláusula 1ª - O prazo é de 30 (trinta) dias & condições. Segunda linha quebrada Valor: R$ 1.000,00");
});
