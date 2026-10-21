import { fold } from "./corpus";
import type { FieldResult, FieldType } from "./types";

/**
 * Comparação estruturada de dois resultados de extração (dashboard de comparação).
 * Só usa valores efetivamente extraídos (ou corrigidos à mão): nada demonstrativo.
 */

export type FieldStatus = "equal" | "changed" | "added" | "removed" | "missing";

export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = {
  equal: "Igual",
  changed: "Alterado",
  added: "Só no revisado",
  removed: "Só no original",
  missing: "Não identificado nos dois",
};

export interface FieldDiff {
  key: string;
  label: string;
  type: FieldType;
  base: FieldResult | null;
  revised: FieldResult | null;
  status: FieldStatus;
  /** Variação percentual (revisado − original) / original, para valores numéricos. */
  variation?: number;
  /** Diferença em dias, para datas e fim de período. */
  daysDelta?: number;
  relevant: boolean;
}

export interface ExtractionDiff {
  fields: FieldDiff[];
  counts: Record<FieldStatus, number>;
  relevant: number;
}

const norm = (v: string | null | undefined) => (v ? fold(v.replace(/\s+/g, " ")).replace(/[^\p{L}\p{N}%/]/gu, "") : "");
const days = (a?: string, b?: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) : undefined);

function same(a: FieldResult, b: FieldResult): boolean {
  if (a.amount !== undefined && b.amount !== undefined) return a.amount === b.amount && (a.currency ?? "") === (b.currency ?? "");
  if (a.type === "period") return a.start === b.start && a.end === b.end && Boolean(a.start);
  if (a.type === "date" && a.start && b.start) return a.start === b.start;
  if (a.type === "list") {
    const sa = new Set((a.items ?? []).map((i) => norm(i.value)));
    const sb = new Set((b.items ?? []).map((i) => norm(i.value)));
    return sa.size === sb.size && [...sa].every((x) => sb.has(x));
  }
  return norm(a.value) === norm(b.value);
}

const has = (f: FieldResult | null | undefined): f is FieldResult => Boolean(f && f.value !== null && f.value !== "");

export function compareExtractions(base: FieldResult[], revised: FieldResult[], important: Set<string> = new Set()): ExtractionDiff {
  const keys = [...new Set([...base.map((f) => f.key), ...revised.map((f) => f.key)])];
  const fields: FieldDiff[] = keys.map((key) => {
    const a = base.find((f) => f.key === key) ?? null;
    const b = revised.find((f) => f.key === key) ?? null;
    const ref = (a ?? b)!;
    let status: FieldStatus;
    if (has(a) && has(b)) status = same(a, b) ? "equal" : "changed";
    else if (has(b)) status = "added";
    else if (has(a)) status = "removed";
    else status = "missing";
    const diff: FieldDiff = { key, label: ref.label, type: ref.type, base: a, revised: b, status, relevant: false };
    if (status === "changed" && a?.amount !== undefined && b?.amount !== undefined && a.amount !== 0) diff.variation = Math.round(((b.amount - a.amount) / a.amount) * 10000) / 100;
    if (status === "changed" && (ref.type === "date" || ref.type === "period")) diff.daysDelta = days(ref.type === "period" ? a?.end : a?.start, ref.type === "period" ? b?.end : b?.start);
    diff.relevant =
      (status === "changed" && (important.has(key) || ["money", "percent", "date", "period", "party", "id"].includes(ref.type))) ||
      ((status === "added" || status === "removed") && important.has(key));
    return diff;
  });
  const counts: Record<FieldStatus, number> = { equal: 0, changed: 0, added: 0, removed: 0, missing: 0 };
  for (const f of fields) counts[f.status]++;
  return { fields, counts, relevant: fields.filter((f) => f.relevant).length };
}
