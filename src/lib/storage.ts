import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/** Bucket privado criado em supabase/sql/001_security.sql. */
export const BUCKET = "documents";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const ALLOWED_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type FileExt = keyof typeof ALLOWED_TYPES;

function bucket() {
  return createServiceClient().storage.from(BUCKET);
}

/** URL de envio direto do navegador ao Storage, válida por 2 horas e de uso único. */
export async function createUploadUrl(path: string) {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`storage.upload_url: ${error?.message ?? "sem dados"}`);
  return data.signedUrl;
}

/** URL temporária (60 s) para abrir ou baixar um arquivo autorizado. */
export async function createDownloadUrl(path: string, fileName: string, download: boolean) {
  const { data, error } = await bucket().createSignedUrl(path, 60, download ? { download: fileName } : undefined);
  if (error || !data) throw new Error(`storage.download_url: ${error?.message ?? "sem dados"}`);
  return data.signedUrl;
}

export async function readObject(path: string): Promise<Uint8Array | null> {
  const { data, error } = await bucket().download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeObject(path: string) {
  await bucket().remove([path]);
}

/** Confere a assinatura do arquivo (não confia na extensão nem no tipo enviado pelo navegador). */
export function hasValidSignature(bytes: Uint8Array, ext: FileExt): boolean {
  if (ext === "pdf") {
    // "%PDF-" nos primeiros 1024 bytes (alguns geradores colocam lixo antes).
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    return head.includes("%PDF-");
  }
  // DOCX = ZIP (PK\x03\x04) contendo a pasta word/.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!zip) return false;
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
  return tail.includes("word/document.xml");
}

/** Contagem aproximada de páginas de um PDF (objetos /Type /Page). null se não der para estimar. */
export function estimatePdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches && matches.length > 0 ? matches.length : null;
}
