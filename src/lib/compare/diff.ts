/**
 * Diff de Myers (O((N+M)·D)) sobre sequências de chaves.
 * Devolve operações agrupadas: equal / delete / insert, com intervalos [a0,a1) e [b0,b1).
 */
export type Op =
  | { kind: "equal"; a0: number; a1: number; b0: number; b1: number }
  | { kind: "delete"; a0: number; a1: number; b0: number; b1: number }
  | { kind: "insert"; a0: number; a1: number; b0: number; b1: number };

export function myers(a: readonly string[], b: readonly string[]): Op[] {
  // Prefixo e sufixo comuns saem antes: deixa o núcleo pequeno na maioria dos contratos.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const core = coreDiff(a, b, start, endA, start, endB);
  const ops: Op[] = [];
  const push = (kind: Op["kind"], a0: number, a1: number, b0: number, b1: number) => {
    if (a0 === a1 && b0 === b1) return;
    const last = ops[ops.length - 1];
    if (last && last.kind === kind && last.a1 === a0 && last.b1 === b0) {
      last.a1 = a1;
      last.b1 = b1;
    } else ops.push({ kind, a0, a1, b0, b1 } as Op);
  };
  push("equal", 0, start, 0, start);
  for (const op of core) push(op.kind, op.a0, op.a1, op.b0, op.b1);
  push("equal", endA, a.length, endB, b.length);
  return ops;
}

/** Myers clássico com trace, aplicado a a[aStart,aEnd) × b[bStart,bEnd). */
function coreDiff(a: readonly string[], b: readonly string[], aStart: number, aEnd: number, bStart: number, bEnd: number): Op[] {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ kind: "insert", a0: aStart, a1: aStart, b0: bStart, b1: bEnd }];
  if (m === 0) return [{ kind: "delete", a0: aStart, a1: aEnd, b0: bStart, b1: bStart }];

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
      else x = v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[aStart + x] === b[bStart + y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  // Volta pelo trace montando os passos (do fim para o começo).
  const steps: { kind: Op["kind"]; x: number; y: number }[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!)) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vd[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      steps.push({ kind: "equal", x, y });
    }
    if (d > 0) {
      if (x === prevX) steps.push({ kind: "insert", x, y: prevY });
      else steps.push({ kind: "delete", x: prevX, y });
    }
    x = prevX;
    y = prevY;
  }
  steps.reverse();

  const ops: Op[] = [];
  for (const s of steps) {
    const a0 = aStart + s.x;
    const b0 = bStart + s.y;
    const a1 = s.kind === "insert" ? a0 : a0 + 1;
    const b1 = s.kind === "delete" ? b0 : b0 + 1;
    const last = ops[ops.length - 1];
    if (last && last.kind === s.kind && last.a1 === a0 && last.b1 === b0) {
      last.a1 = a1;
      last.b1 = b1;
    } else ops.push({ kind: s.kind, a0, a1, b0, b1 } as Op);
  }
  return ops;
}
