import type { DocPos } from "@/components/viewer/document-pane";

/** Ponto de controle entre posições equivalentes nos dois documentos (em "páginas contínuas"). */
export type Anchor = [base: number, revised: number];

export const toLinear = (p: DocPos) => p.page - 1 + p.y;
export const fromLinear = (v: number, pages: number): DocPos => {
  const clamped = Math.max(0, Math.min(pages - 1e-6, v));
  return { page: Math.floor(clamped) + 1, y: clamped - Math.floor(clamped) };
};

/**
 * Monta a correspondência monotônica base → revisado a partir das alterações
 * (trechos movidos são ignorados, pois quebrariam a ordem).
 */
export function buildAnchors(points: Anchor[], basePages: number, revisedPages: number): Anchor[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const out: Anchor[] = [[0, 0]];
  for (const p of sorted) {
    const last = out[out.length - 1]!;
    if (p[0] >= last[0] && p[1] >= last[1]) out.push(p);
  }
  out.push([basePages, revisedPages]);
  return out;
}

/** Interpola a posição equivalente no outro documento. */
export function mapPosition(anchors: Anchor[], value: number, from: 0 | 1): number {
  const to = from === 0 ? 1 : 0;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (value <= b[from] || i === anchors.length - 1) {
      const span = b[from] - a[from];
      const t = span <= 0 ? 0 : (value - a[from]) / span;
      return a[to] + Math.max(0, Math.min(1, t)) * (b[to] - a[to]);
    }
  }
  return value;
}
