import type { Rect } from "@/lib/compare/types";

/** Versão das regras de extração (gravada em cada resultado, para reprodutibilidade). */
export const EXTRACT_ENGINE = "docxy-extract/1.0.0";

export const FIELD_TYPES = ["text", "id", "party", "money", "currency", "percent", "number", "date", "period", "list"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Texto",
  id: "Número/código",
  party: "Parte (nome)",
  money: "Valor monetário",
  currency: "Moeda",
  percent: "Percentual",
  number: "Número",
  date: "Data",
  period: "Período (início e fim)",
  list: "Lista de trechos",
};

export interface FieldDef {
  /** Identificador estável; campos com a mesma chave são comparados no dashboard. */
  key: string;
  label: string;
  type: FieldType;
  /** Rótulos que costumam anteceder o valor no documento ("Prêmio", "Valor do prêmio"…). */
  aliases: string[];
  hint?: string;
  /** Destacado no dashboard quando muda. */
  important?: boolean;
}

export interface ExtractorTemplate {
  template: string;
  name: string;
  documentKind: string;
  description: string;
  fields: FieldDef[];
}

/** Onde o valor foi encontrado. Sempre um trecho que existe no documento. */
export interface Evidence {
  page: number;
  /** Trecho exato do valor. */
  text: string;
  /** Frase em volta, para conferência. */
  context: string;
  rects: Rect[];
  /** Intervalo de tokens do motor (DOCX). */
  from: number;
  to: number;
}

export interface FieldItem {
  value: string;
  evidence: Evidence;
}

export type FieldSource = "rule" | "ai" | "manual";

export interface FieldResult {
  key: string;
  label: string;
  type: FieldType;
  /** null = "Não identificado". Nunca preenchido sem evidência (exceto correção manual). */
  value: string | null;
  /** Valor numérico (money, percent, number) para comparação e gráficos. */
  amount?: number;
  /** Código ISO da moeda (money, currency). */
  currency?: string;
  /** Datas ISO (date: start; period: start e end). */
  start?: string;
  end?: string;
  /** 0–1. */
  confidence: number;
  source: FieldSource;
  evidence: Evidence | null;
  /** Para listas (obrigações…). */
  items?: FieldItem[];
  /** Valor original antes de uma correção manual. */
  original?: { value: string | null; source: FieldSource; confidence: number } | null;
  correctedBy?: string;
  correctedAt?: string;
}

export const NOT_IDENTIFIED = "Não identificado";
