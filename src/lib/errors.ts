/** Erros de domínio compartilhados entre servidor e mensagens da interface. */

export class NotFoundError extends Error {
  constructor(what = "Item") {
    super(`${what} não encontrado`);
    this.name = "NotFoundError";
  }
}

/** Erro de regra de negócio com mensagem pronta para o usuário. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
