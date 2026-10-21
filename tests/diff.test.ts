import { test } from "node:test";
import assert from "node:assert/strict";
import { myers, type Op } from "../src/lib/compare/diff";

function apply(a: string[], b: string[], ops: Op[]) {
  const out: string[] = [];
  for (const op of ops) {
    if (op.kind === "equal") {
      assert.deepEqual(a.slice(op.a0, op.a1), b.slice(op.b0, op.b1));
      out.push(...a.slice(op.a0, op.a1));
    } else if (op.kind === "insert") out.push(...b.slice(op.b0, op.b1));
  }
  return out;
}

test("myers reconstrói a sequência revisada e cobre as duas sequências", () => {
  const rand = (n: number) => Array.from({ length: n }, () => "abcde"[Math.floor(Math.random() * 5)]!);
  for (let i = 0; i < 300; i++) {
    const a = rand(Math.floor(Math.random() * 40));
    const b = rand(Math.floor(Math.random() * 40));
    const ops = myers(a, b);
    assert.deepEqual(apply(a, b, ops), b);
    let ai = 0, bi = 0;
    for (const op of ops) { assert.equal(op.a0, ai); assert.equal(op.b0, bi); ai = op.a1; bi = op.b1; }
    assert.equal(ai, a.length); assert.equal(bi, b.length);
  }
});

test("myers encontra o diff mínimo em casos simples", () => {
  const ops = myers("o prazo é de 30 dias".split(" "), "o prazo é de 45 dias".split(" "));
  assert.deepEqual(ops.map((o) => o.kind), ["equal", "delete", "insert", "equal"]);
});
