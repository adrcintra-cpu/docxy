/**
 * Tipos compartilhados entre a extração de texto, o motor de comparação e o visualizador.
 * Sem dependências: roda no servidor, no navegador e nos testes.
 */

/** Palavra extraída, com caixa normalizada (0–1) na página. DOCX não tem coordenadas (w = 0). */
export interface Word {
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Começa uma nova linha. */
  lb?: 1;
  /** Começa um novo parágrafo. */
  pb?: 1;
}

export interface PageText {
  page: number; // 1…n
  width: number; // pontos (PDF) ou 0 (DOCX)
  height: number;
  words: Word[];
  ocr?: boolean;
}

export interface Rect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CHANGE_TYPES = [
  "INSERTED",
  "REMOVED",
  "REPLACED",
  "PARAGRAPH_CHANGED",
  "CLAUSE_MODIFIED",
  "NUMBER_CHANGED",
  "DATE_CHANGED",
  "MONEY_CHANGED",
  "ENTITY_CHANGED",
  "STRUCTURE_CHANGED",
  "MOVED",
  "FORMATTING",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Um lado de uma alteração: intervalo de palavras [from, to) no documento inteiro. */
export interface ChangeSide {
  page: number;
  from: number;
  to: number;
  text: string;
  rects: Rect[];
}

export interface Change {
  position: number;
  type: ChangeType;
  base: ChangeSide | null;
  revised: ChangeSide | null;
  contextBefore: string;
  contextAfter: string;
  /** Alteração potencialmente relevante (valores, datas, números, cláusulas, trechos longos). */
  relevant: boolean;
}

export interface CompareMetrics {
  engineVersion: string;
  changes: {
    inserted: number;
    removed: number;
    replaced: number;
    moved: number;
    formatting: number;
    total: number;
  };
  words: {
    equal: number;
    inserted: number;
    removed: number;
    replaced: number;
    baseTotal: number;
    revisedTotal: number;
  };
  /** Percentual de diferença, 0–100, com duas casas. */
  differencePercent: number;
  formula: string;
}

export interface CompareResult {
  changes: Change[];
  metrics: CompareMetrics;
}

export const CHANGE_LABEL: Record<ChangeType, string> = {
  INSERTED: "Inserido",
  REMOVED: "Removido",
  REPLACED: "Substituído",
  PARAGRAPH_CHANGED: "Parágrafo alterado",
  CLAUSE_MODIFIED: "Cláusula modificada",
  NUMBER_CHANGED: "Número alterado",
  DATE_CHANGED: "Data alterada",
  MONEY_CHANGED: "Valor alterado",
  ENTITY_CHANGED: "Nome alterado",
  STRUCTURE_CHANGED: "Estrutura alterada",
  MOVED: "Movido",
  FORMATTING: "Formatação",
};

/** Grupo usado nos filtros e nas métricas. */
export function changeGroup(type: ChangeType): "inserted" | "removed" | "replaced" | "moved" | "formatting" {
  if (type === "INSERTED") return "inserted";
  if (type === "REMOVED") return "removed";
  if (type === "MOVED" || type === "STRUCTURE_CHANGED") return "moved";
  if (type === "FORMATTING") return "formatting";
  return "replaced";
}

export const NUMERIC_TYPES: ChangeType[] = ["NUMBER_CHANGED", "DATE_CHANGED", "MONEY_CHANGED"];
