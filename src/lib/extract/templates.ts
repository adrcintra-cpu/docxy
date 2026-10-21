import type { ExtractorTemplate, FieldDef } from "./types";

/**
 * Modelos de extração padrão. Cada organização recebe uma cópia editável na primeira vez
 * que abre o Extrator; campos com a mesma chave são comparados lado a lado no dashboard.
 */

const f = (key: string, label: string, type: FieldDef["type"], aliases: string[], extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, aliases, ...extra });

const NUMBER = f("numero", "Número do contrato", "id", ["contrato nº", "contrato n°", "contrato número", "número do contrato", "numero do contrato", "contrato n.", "nº", "n°"], { important: true });
const CONTRATANTE = f("contratante", "Contratante", "party", ["contratante"]);
const CONTRATADA = f("contratada", "Contratada", "party", ["contratada", "contratado"]);
const CEDENTE = f("cedente", "Cedente", "party", ["cedente"], { important: true });
const SEGURADORA = f("seguradora", "Seguradora", "party", ["seguradora", "resseguradora", "companhia seguradora"]);
const BROKER = f("broker", "Corretora (Broker)", "party", ["broker", "corretora", "corretor", "intermediário", "intermediaria"], { important: true });
const PREMIO = f("premio", "Prêmio", "money", ["prêmio total", "prêmio líquido", "valor do prêmio", "prêmio"], { important: true });
const MOEDA = f("moeda", "Moeda", "currency", ["moeda"]);
const COMISSAO = f("comissao", "Comissão", "percent", ["comissão de corretagem", "comissão", "corretagem", "brokerage"], { important: true });
const VIGENCIA = f("vigencia", "Vigência", "period", ["vigência", "período de vigência", "prazo de vigência", "vigente"], { important: true });
const INICIO = f("inicio", "Data de início", "date", ["data de início", "início", "inicio", "a partir de", "começa"]);
const TERMINO = f("termino", "Data de término", "date", ["data de término", "término", "termino", "fim", "até", "encerra"]);
const PERCENTUAIS = f("percentuais", "Percentuais", "list", ["%"], { hint: "Todos os percentuais citados, com o trecho." });
const VALORES = f("valores", "Valores financeiros", "list", ["R$"], { hint: "Todos os valores monetários citados, com o trecho." });
const OBRIGACOES = f("obrigacoes", "Obrigações contratuais", "list", ["obriga-se", "deverá", "compromete-se", "é responsável", "tem o dever"], {
  hint: "Frases com verbos de obrigação.",
});
const VALOR = f("valor", "Valor total", "money", ["valor total", "valor global", "preço total", "valor do contrato", "valor"], { important: true });
const PRAZO_PAGAMENTO = f("prazo_pagamento", "Prazo de pagamento", "text", ["prazo de", "no prazo de", "em até"], { hint: "Ex.: 30 (trinta) dias" });
const LOB = f("lob", "Line of Business (LoB)", "text", ["line of business", "lob", "ramo", "linha de negócio"]);
const FORO = f("foro", "Foro", "text", ["foro da comarca de", "fica eleito o foro", "foro de", "foro"]);
const MULTA = f("multa", "Multa", "percent", ["multa de", "multa", "penalidade"]);

export const EXTRACTOR_TEMPLATES: ExtractorTemplate[] = [
  {
    template: "contratos",
    name: "Contratos",
    documentKind: "contrato",
    description: "Partes, número, valores, prazos, vigência e obrigações de contratos.",
    fields: [NUMBER, CONTRATANTE, CONTRATADA, CEDENTE, BROKER, PREMIO, MOEDA, COMISSAO, VIGENCIA, INICIO, TERMINO, PRAZO_PAGAMENTO, PERCENTUAIS, VALORES, OBRIGACOES],
  },
  {
    template: "apolices",
    name: "Apólices",
    documentKind: "apólice",
    description: "Seguradora, cedente, corretora, prêmio, comissão, vigência e ramo.",
    fields: [
      f("numero", "Número da apólice", "id", ["apólice nº", "apólice n°", "número da apólice", "apólice", "nº"], { important: true }),
      SEGURADORA,
      CEDENTE,
      BROKER,
      f("segurado", "Segurado", "party", ["segurado", "tomador"]),
      PREMIO,
      MOEDA,
      COMISSAO,
      f("limite", "Limite / Importância segurada", "money", ["importância segurada", "limite máximo de indenização", "limite de responsabilidade", "limite"]),
      f("franquia", "Franquia", "money", ["franquia", "participação obrigatória"]),
      VIGENCIA,
      INICIO,
      TERMINO,
      LOB,
      PERCENTUAIS,
    ],
  },
  {
    template: "juridicos",
    name: "Documentos jurídicos",
    documentKind: "jurídico",
    description: "Partes, objeto, prazos, multas, foro e obrigações.",
    fields: [
      NUMBER,
      CONTRATANTE,
      CONTRATADA,
      f("objeto", "Objeto", "text", ["do objeto", "objeto", "tem por objeto"]),
      VIGENCIA,
      INICIO,
      TERMINO,
      MULTA,
      FORO,
      OBRIGACOES,
    ],
  },
  {
    template: "financeiros",
    name: "Documentos financeiros",
    documentKind: "financeiro",
    description: "Valores, moeda, juros, percentuais e datas de pagamento.",
    fields: [
      VALOR,
      MOEDA,
      f("juros", "Juros", "percent", ["taxa de juros", "juros de", "juros"]),
      MULTA,
      f("vencimento", "Vencimento", "date", ["data de vencimento", "vencimento", "vence em"], { important: true }),
      PRAZO_PAGAMENTO,
      VALORES,
      PERCENTUAIS,
    ],
  },
  {
    template: "propostas",
    name: "Propostas comerciais",
    documentKind: "proposta",
    description: "Cliente, fornecedor, valor, condições de pagamento e validade.",
    fields: [
      f("numero", "Número da proposta", "id", ["proposta nº", "proposta n°", "número da proposta", "nº"]),
      f("cliente", "Cliente", "party", ["cliente", "contratante", "para"]),
      f("fornecedor", "Fornecedor", "party", ["fornecedor", "proponente", "contratada"]),
      VALOR,
      MOEDA,
      f("validade", "Validade da proposta", "text", ["validade da proposta", "validade", "válida por"], { important: true }),
      PRAZO_PAGAMENTO,
      f("entrega", "Prazo de entrega", "text", ["prazo de entrega", "entrega em"]),
      VALORES,
    ],
  },
];
