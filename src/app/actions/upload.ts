"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { can } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/session";
import { guard, ok } from "@/lib/actions";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";
import { documentVisibleWhere, getCtx, requireDocument, requireFolder } from "@/lib/access";
import { processVersion } from "@/lib/processing/run";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  createUploadUrl,
  estimatePdfPages,
  hasValidSignature,
  readObject,
  removeObject,
  type FileExt,
} from "@/lib/storage";

/**
 * Upload em três etapas, para arquivos grandes não passarem pelo servidor da aplicação:
 *   1. prepareUpload  — valida, detecta duplicados, cria o registro e devolve uma URL de envio assinada.
 *   2. o navegador envia o arquivo direto ao Storage privado (com barra de progresso).
 *   3. finalizeUpload — o servidor confere tamanho, SHA-256 e assinatura do arquivo e publica a versão.
 * Uploads interrompidos ficam com stage UPLOADING e são descartados por abortUpload.
 */

const prepareSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "Hash do arquivo inválido."),
  folderId: z.string().uuid().nullish(),
  documentId: z.string().uuid().nullish(),
  allowDuplicate: z.boolean().optional(),
  comment: z.string().trim().max(500).optional(),
});

export type PrepareUploadResult =
  | { kind: "upload"; versionId: string; documentId: string; uploadUrl: string }
  | { kind: "duplicate"; documentId: string; title: string; versionNumber: number };

function extOf(fileName: string): FileExt | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ext === "docx" ? ext : null;
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_").slice(0, 200);
}

export async function prepareUpload(input: z.input<typeof prepareSchema>): Promise<ActionResult<PrepareUploadResult>> {
  return guard(async () => {
    const ctx = await getCtx();
    const data = prepareSchema.parse(input);
    const ext = extOf(data.fileName);
    if (!ext) throw new UserError("Formato não suportado. Envie arquivos PDF ou DOCX.");
    if (data.mimeType && data.mimeType !== ALLOWED_TYPES[ext] && data.mimeType !== "application/octet-stream") {
      throw new UserError("O tipo do arquivo não corresponde à extensão.");
    }
    if (data.size > MAX_UPLOAD_BYTES) throw new UserError("O arquivo passa do limite de 100 MB.");
    const fileName = cleanFileName(data.fileName);

    // Destino: nova versão de um documento, ou novo documento numa pasta / na raiz.
    let documentId = data.documentId ?? null;
    let folderId: string | null = null;
    let workspaceId: string | null = null;
    let versionNumber = 1;

    if (documentId) {
      const { document } = await requireDocument(ctx, documentId, "document.upload");
      const current = document.currentVersionId
        ? await db.documentVersion.findUnique({ where: { id: document.currentVersionId }, select: { sha256: true } })
        : null;
      if (current?.sha256 === data.sha256) throw new UserError("Este arquivo é idêntico à versão atual.");
      const last = await db.documentVersion.aggregate({ where: { documentId }, _max: { versionNumber: true } });
      versionNumber = (last._max.versionNumber ?? 0) + 1;
    } else {
      if (data.folderId) {
        const { folder } = await requireFolder(ctx, data.folderId, "document.upload");
        folderId = folder.id;
        workspaceId = folder.workspaceId;
      } else if (!can(ctx.orgRole, "document.upload")) {
        throw new ForbiddenError("document.upload");
      }

      if (!data.allowDuplicate) {
        const dup = await db.documentVersion.findFirst({
          where: { sha256: data.sha256, stage: { not: "UPLOADING" }, document: { ...documentVisibleWhere(ctx), deletedAt: null } },
          select: { versionNumber: true, document: { select: { id: true, title: true } } },
        });
        if (dup) {
          return ok<PrepareUploadResult>({ kind: "duplicate", documentId: dup.document.id, title: dup.document.title, versionNumber: dup.versionNumber });
        }
      }
    }

    const versionId = randomUUID();
    const docId = documentId ?? randomUUID();
    const storagePath = `${ctx.orgId}/${docId}/${versionId}.${ext}`;

    await db.$transaction(async (tx) => {
      if (!documentId) {
        await tx.document.create({
          data: {
            id: docId,
            organizationId: ctx.orgId,
            workspaceId,
            folderId,
            title: fileName.replace(/\.(pdf|docx)$/i, ""),
            status: "UPLOADING",
            createdById: ctx.userId,
          },
        });
      }
      await tx.documentVersion.create({
        data: {
          id: versionId,
          documentId: docId,
          versionNumber,
          fileName,
          mimeType: ALLOWED_TYPES[ext],
          sizeBytes: BigInt(data.size),
          sha256: data.sha256,
          storagePath,
          stage: "UPLOADING",
          comment: data.comment || null,
          uploadedById: ctx.userId,
        },
      });
    });
    documentId = docId;

    const uploadUrl = await createUploadUrl(storagePath);
    return ok<PrepareUploadResult>({ kind: "upload", versionId, documentId, uploadUrl });
  });
}

async function loadPendingVersion(versionId: string) {
  const ctx = await getCtx();
  const version = await db.documentVersion.findFirst({
    where: { id: z.string().uuid().parse(versionId), uploadedById: ctx.userId, stage: "UPLOADING", document: { organizationId: ctx.orgId } },
    include: { document: { select: { id: true, title: true, folderId: true, currentVersionId: true, createdById: true } } },
  });
  if (!version) throw new NotFoundError("Envio");
  return { ctx, version };
}

export async function finalizeUpload(versionId: string): Promise<ActionResult<{ documentId: string }>> {
  return guard(async () => {
    const { ctx, version } = await loadPendingVersion(versionId);
    await requireDocument(ctx, version.documentId, "document.upload");
    const ext = extOf(version.fileName) as FileExt;

    const bytes = await readObject(version.storagePath);
    const reject = async (reason: string, message: string) => {
      if (bytes) await removeObject(version.storagePath);
      await db.documentVersion.update({ where: { id: version.id }, data: { stage: "FAILED", processingError: reason } });
      if (!version.document.currentVersionId) {
        await db.document.update({ where: { id: version.documentId }, data: { status: "FAILED" } });
      }
      await audit({ event: "document.upload", result: "FAILURE", userId: ctx.userId, organizationId: ctx.orgId, documentId: version.documentId, versionId: version.id, metadata: { reason } });
      throw new UserError(message);
    };

    if (!bytes) return reject("not_found", "O arquivo não chegou ao servidor. Tente enviar de novo.");
    if (BigInt(bytes.byteLength) !== version.sizeBytes) return reject("size_mismatch", "O envio foi interrompido. Tente de novo.");
    if (createHash("sha256").update(bytes).digest("hex") !== version.sha256) return reject("hash_mismatch", "O arquivo foi alterado durante o envio. Tente de novo.");
    if (!hasValidSignature(bytes, ext)) return reject("bad_signature", `O conteúdo não é um ${ext.toUpperCase()} válido.`);

    const isNewVersion = version.versionNumber > 1;
    await db.$transaction([
      db.documentVersion.update({
        where: { id: version.id },
        data: {
          // Vai para a fila de leitura (texto, OCR, indexação), disparada logo abaixo.
          stage: "QUEUED",
          pageCount: ext === "pdf" ? estimatePdfPages(bytes) : null,
        },
      }),
      db.document.update({ where: { id: version.documentId }, data: { currentVersionId: version.id, status: "READY" } }),
    ]);

    await audit({
      event: isNewVersion ? "document.new_version" : "document.upload",
      result: "SUCCESS",
      userId: ctx.userId,
      organizationId: ctx.orgId,
      documentId: version.documentId,
      versionId: version.id,
      metadata: { versionNumber: version.versionNumber, sizeBytes: Number(version.sizeBytes) },
    });

    if (isNewVersion) {
      const watchers = await db.documentPermission.findMany({ where: { documentId: version.documentId }, select: { userId: true } });
      await notify({
        organizationId: ctx.orgId,
        userIds: [version.document.createdById, ...watchers.map((w) => w.userId)],
        exceptUserId: ctx.userId,
        type: "NEW_VERSION",
        title: `Nova versão de ${version.document.title}`,
        body: `${ctx.userName} enviou a versão ${String(version.versionNumber).padStart(2, "0")}.`,
        href: `/documentos/${version.documentId}`,
      });
    }

    // Lê o documento depois de responder ao usuário; o cron /api/jobs/process cobre falhas.
    after(() => processVersion(version.id));

    revalidatePath("/", "layout");
    return ok({ documentId: version.documentId }, isNewVersion ? "Nova versão publicada." : "Arquivo enviado.");
  });
}

/** Descarta um envio interrompido ou cancelado (nunca chegou a ser uma versão). */
export async function abortUpload(versionId: string): Promise<ActionResult> {
  return guard(async () => {
    const { version } = await loadPendingVersion(versionId);
    await removeObject(version.storagePath).catch(() => undefined);
    await db.$transaction(async (tx) => {
      await tx.documentVersion.delete({ where: { id: version.id } });
      if (!version.document.currentVersionId) {
        const others = await tx.documentVersion.count({ where: { documentId: version.documentId } });
        if (others === 0) await tx.document.delete({ where: { id: version.documentId } });
      }
    });
    revalidatePath("/", "layout");
    return ok();
  });
}

/** Coloca de novo na fila uma versão cuja leitura falhou. */
export async function retryProcessing(versionId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const version = await db.documentVersion.findFirst({
      where: { id: z.string().uuid().parse(versionId), stage: "FAILED", document: { organizationId: ctx.orgId } },
      select: { id: true, documentId: true },
    });
    if (!version) throw new NotFoundError("Versão");
    await requireDocument(ctx, version.documentId, "document.upload");
    await db.documentVersion.update({ where: { id: version.id }, data: { stage: "QUEUED", processingError: null } });
    after(() => processVersion(version.id));
    revalidatePath(`/documentos/${version.documentId}`);
    return ok(undefined, "Leitura reiniciada.");
  });
}
