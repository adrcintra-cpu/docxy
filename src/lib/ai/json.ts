import type { z } from "zod";

/** Extrai o primeiro objeto JSON da resposta e valida com o esquema. */
export function parseJson<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const r = schema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
