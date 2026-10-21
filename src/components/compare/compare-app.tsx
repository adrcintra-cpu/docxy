"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BarChart3, ChevronDown, ChevronUp, FileText, Filter, Link2, Link2Off, List, MessageSquare, MoreVertical, Plus, Search } from "lucide-react";
import { addChangeComment, setChangeReview } from "@/app/actions/compare";
import { CHANGE_LABEL, changeGroup, NUMERIC_TYPES, type ChangeType, type CompareMetrics, type Rect } from "@/lib/compare/types";
import { cn } from "@/lib/utils";
import { DocumentPane, type DocPos, type PaneHandle, type ViewerDoc } from "@/components/viewer/document-pane";
import type { Highlight } from "@/components/viewer/page-view";
import { ToolRail, type ToolId } from "@/components/viewer/tool-rail";
import { CompareDialog, type VersionOption } from "./compare-dialog";
import { buildAnchors, fromLinear, mapPosition, toLinear, type Anchor } from "./sync";
import { toast } from "@/components/ui/toast";

export interface ChangeSideData {
  from: number;
  to: number;
  rects: Rect[];
}
export interface ChangeItem {
  id: string;
  position: number;
  type: ChangeType;
  relevant: boolean;
  baseText: string | null;
  revisedText: string | null;
  basePage: number | null;
  revisedPage: number | null;
  base: ChangeSideData | null;
  revised: ChangeSideData | null;
  contextBefore: string | null;
  contextAfter: string | null;
  reviewStatus: "PENDING" | "REVIEWED" | "DISMISSED";
  comments: { id: string; author: string; body: string; createdAt: string }[];
}

type Filter = "all" | "inserted" | "removed" | "replaced" | "numeric" | "relevant" | "pending";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "inserted", label: "Inseridas" },
  { id: "removed", label: "Removidas" },
  { id: "replaced", label: "Substituídas" },
  { id: "numeric", label: "Numéricas" },
  { id: "relevant", label: "Relevantes" },
  { id: "pending", label: "Pendentes" },
];
const PHASE4 = "Fase 4";

function matchesFilter(c: ChangeItem, f: Filter) {
  if (f === "all") return true;
  if (f === "numeric") return NUMERIC_TYPES.includes(c.type);
  if (f === "relevant") return c.relevant;
  if (f === "pending") return c.reviewStatus === "PENDING";
  if (f === "replaced") return changeGroup(c.type) === "replaced" || c.type === "FORMATTING";
  return changeGroup(c.type) === f;
}

const sidePos = (s: ChangeSideData | null, page: number | null): DocPos | null => {
  const r = s?.rects[0];
  if (r) return { page: r.page, y: r.y };
  return page ? { page, y: 0 } : null;
};

/** Tela de comparação (referências 06, 08 e 10). */
export function CompareApp({
  comparisonId,
  base,
  revised,
  changes: initial,
  metrics,
  options,
  canReview,
  canComment,
}: {
  comparisonId: string;
  base: ViewerDoc;
  revised: ViewerDoc;
  changes: ChangeItem[];
  metrics: CompareMetrics;
  options: VersionOption[];
  canReview: boolean;
  canComment: boolean;
}) {
  const router = useRouter();
  const paneA = useRef<PaneHandle>(null);
  const paneB = useRef<PaneHandle>(null);
  const syncing = useRef<0 | 1 | null>(null);
  const [changes, setChanges] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"compare" | "metrics">("compare");
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const [sync, setSync] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [, start] = useTransition();

  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return changes.filter((c) => matchesFilter(c, filter) && (!q || `${c.baseText ?? ""} ${c.revisedText ?? ""}`.toLowerCase().includes(q)));
  }, [changes, filter, text]);

  // ─── Destaques nos dois documentos ─────────────────────────────────────
  const toneFor = (c: ChangeItem, sideName: "base" | "revised"): Highlight["tone"] => (c.type === "MOVED" ? "moved" : sideName === "base" ? "removed" : "inserted");
  const highlights = useMemo(() => {
    const mk = (sideName: "base" | "revised", doc: ViewerDoc): Highlight[] =>
      changes.flatMap((c) => {
        const s = c[sideName];
        if (!s) return [];
        const hasText = sideName === "base" ? c.baseText : c.revisedText;
        if (!hasText && doc.kind === "docx") return [];
        return [
          {
            key: `${sideName}-${c.id}`,
            changeId: c.id,
            tone: toneFor(c, sideName),
            active: c.id === activeId,
            rects: s.rects,
            ...(doc.kind === "docx" && hasText ? { from: s.from, to: s.to } : {}),
          },
        ];
      });
    return { a: mk("base", base), b: mk("revised", revised) };
  }, [changes, activeId, base, revised]);

  // ─── Rolagem sincronizada pelas alterações ─────────────────────────────
  const anchors = useMemo(() => {
    const pts: Anchor[] = [];
    for (const c of changes) {
      if (c.type === "MOVED") continue;
      const a = sidePos(c.base, c.basePage);
      const b = sidePos(c.revised, c.revisedPage);
      if (a && b && base.kind === "pdf" && revised.kind === "pdf") pts.push([toLinear(a), toLinear(b)]);
    }
    return buildAnchors(pts, base.pages.length, revised.pages.length);
  }, [changes, base, revised]);

  const onScroll = useCallback(
    (from: 0 | 1) => (pos: DocPos) => {
      if (!sync || syncing.current === (from === 0 ? 1 : 0)) return;
      syncing.current = from;
      const other = from === 0 ? paneB.current : paneA.current;
      const pages = from === 0 ? revised.pages.length : base.pages.length;
      other?.scrollToPos(fromLinear(mapPosition(anchors, toLinear(pos), from), pages));
      requestAnimationFrame(() => (syncing.current = null));
    },
    [sync, anchors, base.pages.length, revised.pages.length],
  );

  // ─── Navegação entre alterações ────────────────────────────────────────
  const focus = useCallback(
    (id: string) => {
      const c = changes.find((x) => x.id === id);
      if (!c) return;
      setActiveId(id);
      syncing.current = 0; // a próxima rolagem é nossa, não sincroniza de volta
      const go = (pane: PaneHandle | null, doc: ViewerDoc, s: ChangeSideData | null, page: number | null, hasText: boolean) => {
        if (!pane) return;
        if (doc.kind === "docx" && s && hasText) return pane.scrollToToken(s.from);
        const p = sidePos(s, page);
        if (p) pane.scrollToPos(p, { center: true, smooth: true });
      };
      go(paneA.current, base, c.base, c.basePage, Boolean(c.baseText));
      go(paneB.current, revised, c.revised, c.revisedPage, Boolean(c.revisedText));
      setTimeout(() => (syncing.current = null), 700);
      document.getElementById(`chg-${id}`)?.scrollIntoView({ block: "nearest" });
    },
    [changes, base, revised],
  );

  const step = (dir: 1 | -1) => {
    if (visible.length === 0) return;
    const idx = visible.findIndex((c) => c.id === activeId);
    const next = visible[(idx + dir + visible.length) % visible.length]!;
    focus(next.id);
  };

  // ─── Revisão e comentários ─────────────────────────────────────────────
  const review = (c: ChangeItem, status: ChangeItem["reviewStatus"]) => {
    const prev = c.reviewStatus;
    setChanges((list) => list.map((x) => (x.id === c.id ? { ...x, reviewStatus: status } : x)));
    start(async () => {
      const res = await setChangeReview(c.id, status);
      if (!res.ok) {
        setChanges((list) => list.map((x) => (x.id === c.id ? { ...x, reviewStatus: prev } : x)));
        toast(res.error, "error");
      }
    });
  };

  const comment = async (c: ChangeItem, body: string) => {
    const res = await addChangeComment(c.id, body);
    if (!res.ok) return toast(res.error, "error"), false;
    setChanges((list) => list.map((x) => (x.id === c.id ? { ...x, comments: [...x.comments, res.data!] } : x)));
    return true;
  };

  const onTool = (id: ToolId) => {
    if (id === "compare") setPanel("compare");
    if (id === "metrics") setPanel("metrics");
    if (id === "review") {
      setPanel("compare");
      setFilter("pending");
    }
    if (id === "split" || id === "versions") setComparing(true);
    if (id === "download") window.location.href = `/api/comparacoes/${comparisonId}/relatorio`;
  };

  const reviewed = changes.filter((c) => c.reviewStatus !== "PENDING").length;

  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-1 gap-3">
      {/* Trilho esquerdo: documentos abertos e inverter */}
      <nav aria-label="Documentos" className="hidden w-16 shrink-0 flex-col items-center gap-3 rounded-lg bg-surface py-4 md:flex">
        <button type="button" onClick={() => setComparing(true)} aria-label="Comparar outros documentos" title="Comparar outros documentos" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:text-ink">
          <Plus className="size-6" strokeWidth={1.4} />
        </button>
        <span className="h-px w-8 bg-line" aria-hidden />
        {[base, revised].map((d, i) => (
          <a key={d.versionId} href={`/documentos/${d.documentId}/ver?v=${d.versionId}`} title={`${i === 0 ? "Original" : "Revisado"}: ${d.title}`} aria-label={`Abrir ${d.title}`} className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:text-ink">
            <FileText className="size-6" strokeWidth={1.4} />
          </a>
        ))}
        <button
          type="button"
          onClick={() => setSync((v) => !v)}
          aria-pressed={sync}
          title={sync ? "Rolagem sincronizada (clique para soltar)" : "Rolagem independente (clique para sincronizar)"}
          aria-label="Sincronizar rolagem"
          className={cn("mt-auto flex size-11 items-center justify-center rounded-full", sync ? "bg-paper text-on-light" : "text-ink-muted hover:text-ink")}
        >
          {sync ? <Link2 className="size-5" /> : <Link2Off className="size-5" />}
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_28px_1fr] gap-2">
          <DocumentPane ref={paneA} doc={base} highlights={highlights.a} onScroll={onScroll(0)} onHighlightClick={focus} onClose={() => router.push(`/documentos/${base.documentId}`)} className="min-h-[60vh]" />
          <Minimap changes={changes} activeId={activeId} basePages={base.pages.length} revisedPages={revised.pages.length} onSelect={focus} onStep={step} />
          <DocumentPane ref={paneB} doc={revised} highlights={highlights.b} onScroll={onScroll(1)} onHighlightClick={focus} onClose={() => router.push(`/documentos/${revised.documentId}`)} className="min-h-[60vh]" />
        </div>
        {/* Barra do assistente (referência 06) — Fase 4 */}
        <div className="flex items-center gap-6 rounded-lg bg-surface px-6 py-4" title="Assistente de IA — disponível na Fase 4">
          <span className="flex items-center gap-2 text-body-sm text-ink-subtle">
            <List className="size-4" /> Ver conversa
          </span>
          <div className="relative flex h-11 flex-1 items-center opacity-60">
            <input disabled placeholder="Digite o tópico relacionado… (assistente na Fase 4)" aria-label="Pergunta ao assistente (indisponível)" className="h-full w-full rounded-full bg-page pl-5 pr-14 text-body-sm placeholder:text-ink-muted" />
            <span className="absolute right-1 flex size-9 items-center justify-center rounded-full bg-brand text-on-light">
              <Search className="size-4" strokeWidth={2.25} />
            </span>
          </div>
          <span className="flex items-center gap-2 text-body-sm text-ink-subtle">
            <FileText className="size-4" /> Resumo
          </span>
        </div>
      </div>

      <aside className="flex w-[320px] shrink-0 flex-col rounded-lg bg-surface" aria-label={panel === "compare" ? "Lista de mudanças" : "Métricas"}>
        {panel === "compare" ? (
          <>
            <div className="flex items-center gap-3 px-5 pb-3 pt-5">
              <ArrowLeftRight className="size-5 text-ink-muted" strokeWidth={1.5} />
              <h2 className="flex-1 text-body">Lista de mudanças</h2>
              <span className="text-label tabular-nums text-ink-muted" title="Revisadas">
                {reviewed}/{changes.length}
              </span>
            </div>
            <div className="px-5">
              <div className="relative">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtro" aria-label="Filtrar alterações por texto" className="h-10 w-full rounded-sm bg-sunken pl-3 pr-9 text-body-sm placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand" />
                <Filter className="absolute right-3 top-3 size-4 text-ink-muted" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Tipo de alteração">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={cn("rounded-full px-2.5 py-1 text-label", filter === f.id ? "bg-chip font-semibold text-on-light" : "text-ink-muted hover:bg-sunken hover:text-ink")}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-3 min-h-0 flex-1 overflow-y-auto px-3">
              {visible.length === 0 && <li className="px-2 py-10 text-center text-body-sm text-ink-muted">{changes.length === 0 ? "Os documentos são iguais: nenhuma diferença de conteúdo." : "Nenhuma alteração neste filtro."}</li>}
              {visible.map((c) => (
                <ChangeRow
                  key={c.id}
                  change={c}
                  active={c.id === activeId}
                  onFocus={() => focus(c.id)}
                  onReview={(s) => review(c, s)}
                  canReview={canReview}
                  canComment={canComment}
                  commentsOpen={openComments === c.id}
                  onToggleComments={() => setOpenComments((v) => (v === c.id ? null : c.id))}
                  onComment={(b) => comment(c, b)}
                />
              ))}
            </ul>
            <div className="flex items-center justify-center gap-3 border-t border-line/50 py-3">
              <button type="button" onClick={() => step(-1)} aria-label="Alteração anterior" className="rounded-full p-1 text-ink-muted hover:text-ink">
                <ChevronUp className="size-5" />
              </button>
              <span className="rounded-full bg-sunken px-4 py-1 text-body-sm tabular-nums text-ink-muted">
                {visible.length} {visible.length === 1 ? "diferença" : "diferenças"}
              </span>
              <button type="button" onClick={() => step(1)} aria-label="Próxima alteração" className="rounded-full p-1 text-ink-muted hover:text-ink">
                <ChevronDown className="size-5" />
              </button>
            </div>
          </>
        ) : (
          <MetricsPanel metrics={metrics} />
        )}
      </aside>

      <ToolRail
        active={panel === "metrics" ? "metrics" : filter === "pending" ? "review" : "compare"}
        onSelect={onTool}
        states={{
          code: { unavailable: PHASE4 },
          extract: { unavailable: PHASE4 },
          assistant: { unavailable: PHASE4 },
          dashboard: { unavailable: PHASE4 },
        }}
      />

      {comparing && <CompareDialog options={options} defaultBase={base.versionId} defaultRevised={revised.versionId} onClose={() => setComparing(false)} />}
    </div>
  );
}

// ─── Mapa de diferenças (referência 10) ─────────────────────────────────

function Minimap({
  changes,
  activeId,
  basePages,
  revisedPages,
  onSelect,
  onStep,
}: {
  changes: ChangeItem[];
  activeId: string | null;
  basePages: number;
  revisedPages: number;
  onSelect: (id: string) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-surface py-2" aria-label="Mapa de diferenças">
      <button type="button" onClick={() => onStep(1)} aria-label="Próxima alteração" className="text-ink-muted hover:text-ink">
        <ChevronDown className="size-4" />
      </button>
      <button type="button" onClick={() => onStep(-1)} aria-label="Alteração anterior" className="text-ink-muted hover:text-ink">
        <ChevronUp className="size-4" />
      </button>
      <div className="relative mt-1 w-4 flex-1">
        {changes.map((c) => {
          const a = sidePos(c.base, c.basePage);
          const b = sidePos(c.revised, c.revisedPage);
          return (
            <span key={c.id} className="contents">
              {a && c.baseText && (
                <button type="button" onClick={() => onSelect(c.id)} aria-label={`${CHANGE_LABEL[c.type]} ${c.position}`} className={cn("absolute left-0 h-1.5 w-2 rounded-l-sm", c.type === "MOVED" ? "bg-chart" : "bg-removed", c.id === activeId && "ring-2 ring-brand")} style={{ top: `${(toLinear(a) / basePages) * 100}%` }} />
              )}
              {b && c.revisedText && (
                <button type="button" onClick={() => onSelect(c.id)} aria-label={`${CHANGE_LABEL[c.type]} ${c.position}`} className={cn("absolute right-0 h-1.5 w-2 rounded-r-sm", c.type === "MOVED" ? "bg-chart" : "bg-inserted", c.id === activeId && "ring-2 ring-brand")} style={{ top: `${(toLinear(b) / revisedPages) * 100}%` }} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Item da lista ──────────────────────────────────────────────────────

function ChangeRow({
  change: c,
  active,
  onFocus,
  onReview,
  canReview,
  canComment,
  commentsOpen,
  onToggleComments,
  onComment,
}: {
  change: ChangeItem;
  active: boolean;
  onFocus: () => void;
  onReview: (s: ChangeItem["reviewStatus"]) => void;
  canReview: boolean;
  canComment: boolean;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onComment: (body: string) => Promise<boolean>;
}) {
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const dim = c.reviewStatus === "DISMISSED";
  return (
    <li id={`chg-${c.id}`} className={cn("relative border-b border-line/50 px-2 py-4", active && "rounded-md bg-sunken", dim && "opacity-55")}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onFocus} className="min-w-0 flex-1 text-left" aria-label={`Ir para a alteração ${c.position}`}>
          <p className="flex items-center gap-2 text-body-sm text-ink">
            {CHANGE_LABEL[c.type]}
            {c.relevant && <span className="rounded-full bg-brand/90 px-1.5 text-[10px] font-semibold text-on-light">Relevante</span>}
          </p>
          {c.baseText && <p className="mt-1.5 line-clamp-2 text-body-sm text-[#f0807e]">{c.baseText}</p>}
          {c.revisedText && <p className={cn("mt-1 line-clamp-2 text-body-sm", c.type === "MOVED" ? "text-chart" : "text-inserted")}>{c.revisedText}</p>}
          <p className="mt-1.5 text-label tabular-nums text-ink-muted">
            <span className="text-[#f0807e]">pág. {c.basePage ?? "—"}</span> → <span className="text-inserted">pág. {c.revisedPage ?? "—"}</span>
          </p>
        </button>
        <div className="flex flex-col items-center gap-2">
          <input
            type="checkbox"
            checked={c.reviewStatus === "REVIEWED"}
            disabled={!canReview}
            onChange={(e) => onReview(e.target.checked ? "REVIEWED" : "PENDING")}
            aria-label={`Marcar alteração ${c.position} como revisada`}
            title={canReview ? "Revisada" : "Seu perfil não permite revisar"}
            className="size-5 cursor-pointer appearance-none rounded-[4px] border border-ink-muted checked:border-brand checked:bg-brand disabled:cursor-not-allowed"
          />
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Ações" aria-expanded={menu} className="rounded-full p-0.5 text-ink-muted hover:text-ink">
              <MoreVertical className="size-4" />
            </button>
            {menu && (
              <ul className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-overlay p-1 text-body-sm shadow-panel" onClick={() => setMenu(false)}>
                <li>
                  <button type="button" onClick={onToggleComments} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-surface">
                    <MessageSquare className="size-4" /> Comentários ({c.comments.length})
                  </button>
                </li>
                {canReview && (
                  <li>
                    <button type="button" onClick={() => onReview(dim ? "PENDING" : "DISMISSED")} className="w-full rounded-sm px-3 py-2 text-left hover:bg-surface">
                      {dim ? "Considerar de novo" : "Ignorar alteração"}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          {c.comments.length > 0 && !commentsOpen && (
            <button type="button" onClick={onToggleComments} aria-label={`${c.comments.length} comentários`} className="flex items-center gap-0.5 text-label text-ink-muted">
              <MessageSquare className="size-3.5" />
              {c.comments.length}
            </button>
          )}
        </div>
      </div>
      {commentsOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded-sm bg-page p-3">
          {(c.contextBefore || c.contextAfter) && (
            <p className="text-label text-ink-subtle">
              …{c.contextBefore} <mark className="bg-brand/30 text-ink">{c.baseText ?? c.revisedText}</mark> {c.contextAfter}…
            </p>
          )}
          {c.comments.map((m) => (
            <div key={m.id} className="text-body-sm">
              <span className="font-semibold">{m.author}</span> <span className="text-label text-ink-subtle">{new Date(m.createdAt).toLocaleDateString("pt-BR")}</span>
              <p className="whitespace-pre-line text-ink-muted">{m.body}</p>
            </div>
          ))}
          {canComment && (
            <form
              className="flex flex-col gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                setSending(true);
                if (await onComment(draft)) setDraft("");
                setSending(false);
              }}
            >
              <label htmlFor={`cm-${c.id}`} className="sr-only">
                Novo comentário
              </label>
              <textarea id={`cm-${c.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000} placeholder="Comentar esta alteração" className="rounded-sm bg-sunken px-2 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              <button type="submit" disabled={sending || !draft.trim()} className="self-end rounded-full bg-brand px-3 py-1 text-label font-semibold text-on-light disabled:opacity-50">
                Comentar
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Métricas (referência 08) ───────────────────────────────────────────

function MetricsPanel({ metrics: m }: { metrics: CompareMetrics }) {
  const words = [
    { label: "Iguais", value: m.words.equal, cls: "bg-chip" },
    { label: "Inseridas", value: m.words.inserted, cls: "bg-inserted" },
    { label: "Removidas", value: m.words.removed, cls: "bg-removed" },
    { label: "Substituídas", value: m.words.replaced, cls: "bg-brand" },
  ];
  const totalWords = words.reduce((s, w) => s + w.value, 0) || 1;
  const row = (label: string, value: string | number) => (
    <div className="flex items-center justify-between py-2.5 text-body-sm">
      <dt className="text-ink">{label}</dt>
      <dd className="tabular-nums text-accent-strong">{value}</dd>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center gap-3">
        <BarChart3 className="size-5 text-ink-muted" strokeWidth={1.5} />
        <h2 className="text-body">Métricas</h2>
      </div>
      <section className="rounded-md bg-sunken px-4 py-3">
        <h3 className="mb-1 text-label font-semibold text-ink-muted">Total de mudanças analisadas</h3>
        <dl>
          {row("Inserções:", m.changes.inserted)}
          {row("Remoções:", m.changes.removed)}
          {row("Substituições:", m.changes.replaced)}
          {row("Movidos:", m.changes.moved)}
          {row("Formatação:", m.changes.formatting)}
          {row("Total de mudanças:", m.changes.total)}
          {row("Porcentagem de diferenças:", `${m.differencePercent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`)}
        </dl>
      </section>
      <section className="rounded-md bg-sunken px-4 py-3">
        <h3 className="mb-1 text-label font-semibold text-ink-muted">Total de palavras analisadas</h3>
        <dl>
          {words.map((w) => (
            <div key={w.label}>{row(`${w.label}:`, w.value.toLocaleString("pt-BR"))}</div>
          ))}
        </dl>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full" role="img" aria-label="Proporção de palavras iguais, inseridas, removidas e substituídas">
          {words.map((w) => (
            <span key={w.label} className={w.cls} style={{ width: `${(w.value / totalWords) * 100}%` }} />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-muted">
          {words.map((w) => (
            <li key={w.label} className="flex items-center gap-1">
              <span className={cn("size-2 rounded-full", w.cls)} /> {w.label}
            </li>
          ))}
        </ul>
      </section>
      <section className="text-label text-ink-subtle">
        <h3 className="mb-1 font-semibold text-ink-muted">Como é calculado</h3>
        <p>{m.formula}</p>
        <p className="mt-2">
          Original: {m.words.baseTotal.toLocaleString("pt-BR")} palavras · Revisado: {m.words.revisedTotal.toLocaleString("pt-BR")} palavras · Motor {m.engineVersion}
        </p>
      </section>
    </div>
  );
}
