import type { ChangeType, Rect } from "@/lib/compare/types";
import type { Corpus } from "@/lib/extract/corpus";
import type { FieldResult } from "@/lib/extract/types";

/** Referência clicável a um trecho real de um documento. */
export interface Citation {
  id: string;
  versionId: string;
  docTitle: string;
  page: number;
  text: string;
  rects: Rect[];
  /** Intervalo de tokens do motor (DOCX). */
  from: number;
  to: number;
}

export type AnswerMode = "ia" | "regras";

export interface AssistantAnswer {
  answer: string;
  explanation?: string;
  citations: Citation[];
  /** false = os documentos não trazem a resposta (a limitação é dita ao usuário). */
  found: boolean;
  mode: AnswerMode;
}

export interface SourceDoc {
  versionId: string;
  title: string;
  /** "original" / "revisado" numa comparação. */
  role?: "base" | "revised";
  corpus: Corpus;
  fields?: FieldResult[];
}

export interface ChangeLite {
  position: number;
  type: ChangeType;
  relevant: boolean;
  baseText: string | null;
  revisedText: string | null;
  basePage: number | null;
  revisedPage: number | null;
  base: { from: number; to: number; rects: Rect[] } | null;
  revised: { from: number; to: number; rects: Rect[] } | null;
}

export interface ComparisonContext {
  changes: ChangeLite[];
  differencePercent: number;
  counts: { inserted: number; removed: number; replaced: number; moved: number; formatting: number; total: number };
}

export const SUMMARY_KINDS = ["executive", "changes", "contract", "risks", "financial"] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

export const SUMMARY_LABEL: Record<SummaryKind, string> = {
  executive: "Resumo executivo",
  changes: "Resumo de alterações",
  contract: "Resumo contratual",
  risks: "Resumo de riscos",
  financial: "Resumo financeiro",
};

export interface SummaryItem {
  text: string;
  citations: Citation[];
}

export interface Summary {
  kind: SummaryKind;
  title: string;
  generatedBy: AnswerMode;
  sections: { heading: string; items: SummaryItem[] }[];
  disclaimer?: string;
  /** Aviso quando o resumo não pôde ser feito (ex.: resumo de alterações sem comparação). */
  notice?: string;
}
