import { cn, initials } from "@/lib/utils";

const palette = [
  "bg-avatar-lime text-on-light",
  "bg-avatar-purple text-ink",
  "bg-avatar-orange text-on-light",
  "bg-avatar-red text-ink",
] as const;

/** Cor estável por pessoa: o mesmo id sempre cai na mesma cor. */
function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function Avatar({
  name,
  id,
  size = 40,
  className,
}: {
  name: string;
  id?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-surface",
        colorFor(id ?? name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
  size = 40,
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="stack-hover flex -space-x-3">
        {shown.map((p) => (
          <Avatar key={p.id} id={p.id} name={p.name} size={size} />
        ))}
      </div>
      {rest > 0 && <span className="ml-2 text-body-sm text-ink">+ {rest}</span>}
    </div>
  );
}
