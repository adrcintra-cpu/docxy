import Link from "next/link";
import { FileText, Folder, History, Pin } from "lucide-react";

export interface SidebarItem {
  id: string;
  kind: "document" | "folder";
  name: string;
  subtitle?: string;
  href: string;
}

/** Menu lateral: Fixados e Recentes (referências 02–03). Dados reais do banco. */
export function Sidebar({ pinned, recent }: { pinned: SidebarItem[]; recent: SidebarItem[] }) {
  return (
    <aside className="flex flex-col gap-6 rounded-lg bg-surface p-6">
      <Section icon={<Pin className="size-4" />} title="Fixados" empty="Fixe pastas e documentos para acessá-los aqui.">
        {pinned.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </Section>
      <div className="h-px bg-line/60" />
      <Section icon={<History className="size-4" />} title="Recentes" empty="Os documentos que você abrir aparecem aqui.">
        {recent.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </Section>
    </aside>
  );
}

function Section({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-body-sm text-ink-muted">
        {icon}
        {title}
      </h2>
      {children.length === 0 ? <p className="text-label text-ink-subtle">{empty}</p> : <ul className="flex flex-col gap-1">{children}</ul>}
    </section>
  );
}

function Row({ item }: { item: SidebarItem }) {
  const Icon = item.kind === "folder" ? Folder : FileText;
  return (
    <li>
      <Link href={item.href} className="flex items-start gap-3 rounded-sm px-2 py-2 hover:translate-x-0.5 hover:bg-sunken [&:hover_svg]:text-brand">
        <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={1.5} />
        <span className="min-w-0">
          <span className="block truncate text-body-sm">{item.name}</span>
          {item.subtitle && <span className="block truncate text-label text-ink-muted">{item.subtitle}</span>}
        </span>
      </Link>
    </li>
  );
}
