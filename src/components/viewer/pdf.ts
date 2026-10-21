"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

/** PDF.js no navegador: carregado sob demanda, um worker e um documento por versão. */
let lib: Promise<typeof import("pdfjs-dist")> | null = null;
const cache = new Map<string, Promise<PDFDocumentProxy>>();

export function pdfjs() {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      // Copiado de pdfjs-dist para public/ no postinstall (scripts/copy-pdf-worker.mjs).
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return lib;
}

/** Baixa a versão pela rota autenticada (que redireciona para uma URL assinada). */
export function loadPdf(versionId: string): Promise<PDFDocumentProxy> {
  let p = cache.get(versionId);
  if (!p) {
    p = pdfjs().then(
      (m) =>
        m.getDocument({
          url: `/api/versions/${versionId}`,
          disableRange: true,
          disableStream: true,
          isEvalSupported: false,
          withCredentials: false,
        }).promise,
    );
    p.catch(() => cache.delete(versionId));
    cache.set(versionId, p);
  }
  return p;
}
