import type { Role } from "@prisma/client";

/**
 * Matriz de permissões. Fonte única usada pelo servidor (requirePermission)
 * e, apenas para esconder controles, pela interface. A interface nunca é a
 * barreira: toda ação é verificada de novo no servidor.
 */
export const ACTIONS = [
  "org.manage",
  "org.audit.read",
  "member.invite",
  "member.manage",
  "workspace.create",
  "workspace.manage",
  "folder.create",
  "folder.manage",
  "document.read",
  "document.upload",
  "document.edit",
  "document.delete",
  "document.share",
  "document.download",
  "comparison.run",
  "comparison.review",
  "extractor.manage",
  "extraction.run",
  "ai.ask",
  "comment.write",
] as const;

export type Action = (typeof ACTIONS)[number];

const VIEWER: Action[] = ["document.read", "document.download", "ai.ask"];
const WRITER: Action[] = [
  ...VIEWER,
  "document.upload",
  "folder.create",
  "comparison.run",
  "extraction.run",
  "comment.write",
];
const EDITOR: Action[] = [
  ...WRITER,
  "document.edit",
  "document.delete",
  "document.share",
  "folder.manage",
  "comparison.review",
];
const OWNER: Action[] = [...EDITOR, "member.invite", "workspace.create", "workspace.manage", "extractor.manage"];
const ADMIN: Action[] = [...ACTIONS];

export const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  VIEWER: new Set(VIEWER),
  WRITER: new Set(WRITER),
  EDITOR: new Set(EDITOR),
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return role ? PERMISSIONS[role].has(action) : false;
}

const RANK: Record<Role, number> = { VIEWER: 0, WRITER: 1, EDITOR: 2, OWNER: 3, ADMIN: 4 };

/** Maior papel entre vários (ex.: papel na organização × papel no workspace × permissão explícita). */
export function highestRole(...roles: (Role | null | undefined)[]): Role | null {
  let best: Role | null = null;
  for (const r of roles) if (r && (best === null || RANK[r] > RANK[best])) best = r;
  return best;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  OWNER: "Owner",
  EDITOR: "Editor",
  WRITER: "Writer",
  VIEWER: "Viewer",
};
