/** Variáveis obrigatórias para o Docxy funcionar (só os nomes; nunca os valores). */
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
] as const;

export function missingEnv(): string[] {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Página mostrada enquanto o deploy não tem as variáveis do Supabase. */
export function setupPage(missing: string[]): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Docxy · configuração pendente</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#1f232e;color:#fff;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
main{max-width:560px;background:#2a3040;border-radius:16px;padding:32px}h1{margin:0 0 8px;font-size:20px}p{color:#98a1b8;margin:8px 0}code{background:#20242f;border-radius:6px;padding:2px 6px;color:#f7ec5c;font-size:13px}ul{padding-left:20px}li{margin:4px 0}b{color:#f7ec5c}</style></head>
<body><main><h1>docxy <b>·</b> configuração pendente</h1><p>O app foi publicado, mas ainda faltam variáveis de ambiente na Vercel (<i>Project › Settings › Environment Variables</i>):</p>
<ul>${missing.map((m) => `<li><code>${esc(m)}</code></li>`).join("")}</ul>
<p>Depois de adicioná-las, faça um novo deploy (<i>Deployments › Redeploy</i>): o build cria as tabelas no Supabase automaticamente. O passo a passo está em <code>docs/deploy-vercel.md</code>.</p></main></body></html>`;
}
