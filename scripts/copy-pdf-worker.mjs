// Copia o worker do PDF.js para public/ (servido em /pdf.worker.min.mjs), na mesma versão do pacote.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src)) {
  mkdirSync("public", { recursive: true });
  copyFileSync(src, "public/pdf.worker.min.mjs");
  console.log("pdf.worker.min.mjs copiado para public/");
} else console.warn("pdfjs-dist não encontrado; worker não copiado");
