"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, HelpCircle, History, List, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { askAssistant, getConversation, listConversations, type ChatMessageView } from "@/app/actions/assistant";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PanelHeader, SourceChip, type LocateTarget } from "./shared";

export interface AssistantScope {
  versionIds: string[];
  comparisonId?: string | null;
}

const EXAMPLES_COMPARE = ["Quais foram as principais alterações?", "Houve mudança de valores?", "Quais cláusulas foram modificadas?", "Quais obrigações foram adicionadas?"];
const EXAMPLES_DOC = ["Resuma este contrato.", "Quais são os prazos relevantes?", "Qual é o valor do prêmio?", "Quais são as obrigações da contratada?"];

/** Estado do assistente, compartilhado entre a barra de pergunta e o painel. */
export function useAssistant(scope: AssistantScope) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [busy, setBusy] = useState(false);
  const key = `${scope.comparisonId ?? ""}|${scope.versionIds.join(",")}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
  }, [key]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return false;
      setBusy(true);
      const temp: ChatMessageView = { id: `tmp-${Date.now()}`, role: "user", content: q, citations: [], createdAt: new Date().toISOString() };
      setMessages((m) => [...m, temp]);
      const res = await askAssistant({ conversationId, versionIds: scopeRef.current.versionIds, comparisonId: scopeRef.current.comparisonId, question: q });
      setBusy(false);
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        toast(res.error, "error");
        return false;
      }
      setConversationId(res.data!.conversationId);
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), res.data!.user, res.data!.reply]);
      return true;
    },
    [busy, conversationId],
  );

  const open = useCallback(async (id: string) => {
    const res = await getConversation(id);
    if (!res.ok) return toast(res.error, "error");
    setConversationId(res.data!.id);
    setMessages(res.data!.messages);
  }, []);

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
  }, []);

  return { conversationId, messages, busy, ask, open, reset, scope };
}

export type AssistantState = ReturnType<typeof useAssistant>;

/** Painel do assistente de IA: conversa com respostas fundamentadas e referências clicáveis. */
export function AssistantPanel({ state, titles, onLocate }: { state: AssistantState; titles: Record<string, string>; onLocate: (t: LocateTarget) => void }) {
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; title: string | null; updatedAt: string }[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const examples = state.scope.comparisonId ? EXAMPLES_COMPARE : EXAMPLES_DOC;

  useEffect(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }), [state.messages.length, state.busy]);

  const loadHistory = async () => {
    setHistoryOpen((v) => !v);
    if (history) return;
    const res = await listConversations(state.scope);
    if (res.ok) setHistory(res.data!);
    else toast(res.error, "error");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={HelpCircle} title="Assistente">
        <button type="button" onClick={loadHistory} aria-expanded={historyOpen} aria-label="Conversas anteriores" title="Conversas anteriores" className="rounded-full p-1 text-ink-muted hover:text-ink">
          <History className="size-4" />
        </button>
        <button type="button" onClick={() => (state.reset(), setHistoryOpen(false))} aria-label="Nova conversa" title="Nova conversa" className="rounded-full p-1 text-ink-muted hover:text-ink">
          <Plus className="size-4" />
        </button>
      </PanelHeader>

      {historyOpen && (
        <div className="mx-5 mb-2 max-h-48 overflow-y-auto rounded-md bg-page p-1 text-body-sm">
          {history === null && <p className="px-3 py-2 text-ink-muted">Carregando…</p>}
          {history?.length === 0 && <p className="px-3 py-2 text-ink-muted">Nenhuma conversa anterior aqui.</p>}
          {history?.map((h) => (
            <button key={h.id} type="button" onClick={() => (state.open(h.id), setHistoryOpen(false))} className={cn("flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left hover:bg-surface", h.id === state.conversationId && "text-brand")}>
              <span className="truncate">{h.title ?? "Conversa"}</span>
              <span className="shrink-0 text-[10px] text-ink-subtle">{new Date(h.updatedAt).toLocaleDateString("pt-BR")}</span>
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4" aria-live="polite">
        {state.messages.length === 0 && (
          <div className="flex flex-col gap-2 py-4">
            <p className="px-1 text-body-sm text-ink-muted">Pergunte sobre {state.scope.comparisonId ? "as duas versões" : "este documento"}. As respostas citam página e trecho de origem.</p>
            {examples.map((e) => (
              <button key={e} type="button" onClick={() => state.ask(e)} className="rounded-md bg-sunken px-3 py-2 text-left text-body-sm text-ink hover:bg-page">
                {e}
              </button>
            ))}
          </div>
        )}
        <ul className="flex flex-col gap-3 py-2">
          {state.messages.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="ml-8 self-end rounded-lg rounded-br-sm bg-overlay px-3 py-2 text-body-sm text-ink">
                {m.content}
              </li>
            ) : (
              <li key={m.id} className={cn("mr-2 rounded-lg rounded-bl-sm bg-sunken px-3 py-2.5 text-body-sm", m.found === false && "border border-line/70")}>
                <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-caps text-ink-subtle">
                  {m.mode === "ia" ? <Sparkles className="size-3" /> : <Search className="size-3" />}
                  {m.mode === "ia" ? "IA · fundamentada nos trechos" : "Busca nos documentos"}
                </p>
                <p className="whitespace-pre-line text-ink">{m.content}</p>
                {m.explanation && <p className="mt-1.5 whitespace-pre-line text-label text-ink-muted">{m.explanation}</p>}
                {m.citations.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5 border-t border-line/40 pt-2">
                    {m.citations.map((c, i) => (
                      <li key={`${c.id}-${i}`} className="flex flex-col gap-0.5">
                        <SourceChip page={c.page} label={titles[c.versionId] ?? c.docTitle} onClick={() => onLocate(c)} className="self-start" />
                        <blockquote className="line-clamp-3 border-l-2 border-line pl-2 text-label text-ink-muted">{c.text}</blockquote>
                      </li>
                    ))}
                  </ul>
                )}
                {m.note && <p className="mt-2 text-[10px] text-ink-subtle">{m.note}</p>}
              </li>
            ),
          )}
          {state.busy && (
            <li className="flex items-center gap-2 px-2 text-label text-ink-muted">
              <Loader2 className="size-3.5 animate-spin" /> Procurando nos documentos…
            </li>
          )}
        </ul>
        <div ref={end} />
      </div>

      <form
        className="border-t border-line/50 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await state.ask(draft)) setDraft("");
        }}
      >
        <label htmlFor="assistant-q" className="sr-only">
          Pergunta ao assistente
        </label>
        <div className="relative">
          <input id="assistant-q" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Pergunte algo…" className="h-10 w-full rounded-full bg-page pl-4 pr-11 text-body-sm placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand" />
          <button type="submit" disabled={state.busy || !draft.trim()} aria-label="Perguntar" className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-brand text-on-light disabled:opacity-50">
            <Search className="size-4" strokeWidth={2.25} />
          </button>
        </div>
      </form>
    </div>
  );
}

/** Barra inferior "Ver conversa | Digite o tópico… | Resumo" (referências 06 e 07). */
export function AskBar({ state, onOpenConversation, onOpenSummary }: { state: AssistantState; onOpenConversation: () => void; onOpenSummary: () => void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-surface px-6 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onOpenConversation();
        if (await state.ask(draft)) setDraft("");
      }}
    >
      <button type="button" onClick={onOpenConversation} className="flex items-center gap-2 text-body-sm text-ink-muted hover:text-ink">
        <List className="size-4" /> Ver conversa
      </button>
      <div className="relative flex h-11 min-w-[200px] flex-1 items-center">
        <label htmlFor="askbar" className="sr-only">
          Pergunta ao assistente
        </label>
        <input id="askbar" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Digite o tópico relacionado…" className="h-full w-full rounded-full bg-page pl-5 pr-14 text-body-sm placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand" />
        <button type="submit" disabled={state.busy} aria-label="Perguntar ao assistente" className="absolute right-1 flex size-9 items-center justify-center rounded-full bg-brand text-on-light transition-transform hover:scale-105 disabled:opacity-60">
          {state.busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" strokeWidth={2.25} />}
        </button>
      </div>
      <button type="button" onClick={onOpenSummary} className="flex items-center gap-2 text-body-sm text-ink-muted hover:text-ink">
        <FileText className="size-4" /> Resumo
      </button>
    </form>
  );
}
