import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processQueue } from "@/lib/processing/run";

/**
 * Processa a fila de leitura de documentos. Chamado por um agendador (ex.: Vercel Cron
 * a cada 5 minutos) com o cabeçalho  Authorization: Bearer <CRON_SECRET>.
 * O upload já dispara o processamento na hora; isto cobre retentativas e travamentos.
 */
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const results = await processQueue(5);
  return NextResponse.json({ processed: Object.keys(results).length, results });
}

export const GET = handle;
export const POST = handle;
