"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, FileText, Loader2, Upload, X } from "lucide-react";
import { abortUpload, finalizeUpload, prepareUpload } from "@/app/actions/upload";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn, formatBytes } from "@/lib/utils";

const MAX_BYTES = 100 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Status = "waiting" | "hashing" | "uploading" | "verifying" | "done" | "duplicate" | "error";
interface Item {
  key: string;
  file: File;
  status: Status;
  progress: number;
  message?: string;
  duplicateOf?: string;
}

function localError(file: File): string | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pdf" && ext !== "docx") return "Formato não suportado (use PDF ou DOCX).";
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_BYTES) return "Passa do limite de 100 MB.";
  return undefined;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Envio direto ao Storage com progresso real (XHR); o servidor só recebe a confirmação. */
function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("rede"));
    xhr.send(file);
  });
}

export function UploadButton({
  folderId,
  documentId,
  label = "Upload arquivo",
  disabledReason,
  variant = "primary",
}: {
  folderId?: string | null;
  documentId?: string;
  label?: string;
  /** Quando definido, o botão aparece desabilitado com este motivo (ex.: perfil sem permissão). */
  disabledReason?: string;
  variant?: "primary" | "brand";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} disabled={Boolean(disabledReason)} title={disabledReason} onClick={() => setOpen(true)}>
        <Upload className="size-4" /> {label}
      </Button>
      {open && <UploadDialog folderId={folderId} documentId={documentId} onClose={() => setOpen(false)} />}
    </>
  );
}

function UploadDialog({ folderId, documentId, onClose }: { folderId?: string | null; documentId?: string; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const single = Boolean(documentId); // nova versão: um arquivo por vez

  const patch = (key: string, data: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...data } : it)));

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files).slice(0, single ? 1 : 20);
      setItems((list) => [
        ...(single ? [] : list.filter((it) => it.status !== "done")),
        ...incoming.map((file) => {
          const err = localError(file);
          return { key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, status: err ? ("error" as const) : ("waiting" as const), progress: 0, message: err };
        }),
      ]);
    },
    [single],
  );

  async function send(item: Item, allowDuplicate = false) {
    patch(item.key, { status: "hashing", message: undefined, progress: 0 });
    let versionId: string | undefined;
    try {
      const hash = await sha256(item.file);
      const prep = await prepareUpload({
        fileName: item.file.name,
        size: item.file.size,
        mimeType: item.file.type,
        sha256: hash,
        folderId: folderId ?? null,
        documentId: documentId ?? null,
        allowDuplicate,
      });
      if (!prep.ok) return patch(item.key, { status: "error", message: prep.error });
      if (prep.data?.kind === "duplicate") {
        return patch(item.key, {
          status: "duplicate",
          duplicateOf: prep.data.documentId,
          message: `Igual a "${prep.data.title}" (vs${String(prep.data.versionNumber).padStart(2, "0")}).`,
        });
      }
      if (!prep.data || prep.data.kind !== "upload") throw new Error("resposta inesperada");
      versionId = prep.data.versionId;

      patch(item.key, { status: "uploading" });
      await putWithProgress(prep.data.uploadUrl, item.file, (p) => patch(item.key, { progress: p }));

      patch(item.key, { status: "verifying", progress: 1 });
      const fin = await finalizeUpload(versionId);
      if (!fin.ok) return patch(item.key, { status: "error", message: fin.error });
      patch(item.key, { status: "done" });
    } catch {
      if (versionId) await abortUpload(versionId).catch(() => undefined);
      patch(item.key, { status: "error", message: "O envio falhou. Verifique a conexão e tente de novo." });
    }
  }

  async function sendAll() {
    setBusy(true);
    // Em sequência: mantém a ordem e não satura a conexão.
    for (const item of items.filter((it) => it.status === "waiting")) await send(item);
    setBusy(false);
    router.refresh();
  }

  const doneCount = items.filter((it) => it.status === "done").length;
  const waiting = items.filter((it) => it.status === "waiting").length;

  function close() {
    if (busy) return;
    if (doneCount > 0) toast(doneCount === 1 ? (single ? "Nova versão publicada." : "Arquivo enviado.") : `${doneCount} arquivos enviados.`);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      title={single ? "Enviar nova versão" : "Enviar arquivos"}
      description="PDF ou DOCX, até 100 MB cada. O arquivo é conferido no servidor antes de ser publicado."
      className="w-[min(560px,calc(100vw-32px))]"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-brand bg-brand/5" : "border-line",
        )}
      >
        <Upload className="size-8 text-ink-muted" strokeWidth={1.5} />
        <p className="text-body">Arraste {single ? "o arquivo" : "os arquivos"} para cá</p>
        <button type="button" onClick={() => input.current?.click()} className="text-body-sm text-accent-strong hover:underline">
          ou escolha no computador
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple={!single}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {items.map((it) => (
            <li key={it.key} className="rounded-sm bg-sunken px-3 py-3">
              <div className="flex items-center gap-3">
                <FileText className="size-5 shrink-0 text-removed" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm">{it.file.name}</p>
                  <p className={cn("text-label", it.status === "error" ? "text-[#f0a3a2]" : "text-ink-muted")}>
                    {it.message ??
                      {
                        waiting: formatBytes(it.file.size),
                        hashing: "Conferindo o arquivo…",
                        uploading: `Enviando ${Math.round(it.progress * 100)}%`,
                        verifying: "Verificando no servidor…",
                        done: "Enviado",
                        duplicate: "",
                        error: "",
                      }[it.status]}
                  </p>
                </div>
                {it.status === "done" && <CircleCheck className="size-5 text-inserted" />}
                {it.status === "error" && <CircleAlert className="size-5 text-[#f0a3a2]" />}
                {["hashing", "uploading", "verifying"].includes(it.status) && <Loader2 className="size-5 animate-spin text-ink-muted" />}
                {(it.status === "waiting" || it.status === "error") && !busy && (
                  <button type="button" aria-label={`Remover ${it.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="rounded-full p-1 text-ink-muted hover:text-ink">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {it.status === "uploading" && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(it.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-brand transition-[width] duration-150" style={{ width: `${it.progress * 100}%` }} />
                </div>
              )}
              {it.status === "duplicate" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await send(it, true);
                      router.refresh();
                    }}
                  >
                    Enviar mesmo assim
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                    Pular
                  </Button>
                  {it.duplicateOf && (
                    <a href={`/documentos/${it.duplicateOf}`} className="self-center text-label text-accent-strong hover:underline">
                      Ver o existente
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={close} disabled={busy}>
          {doneCount > 0 && waiting === 0 ? "Concluir" : "Cancelar"}
        </Button>
        <Button variant="brand" onClick={sendAll} disabled={waiting === 0} loading={busy}>
          Enviar{waiting > 1 ? ` ${waiting} arquivos` : ""}
        </Button>
      </div>
    </Dialog>
  );
}
