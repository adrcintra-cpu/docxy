import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-chip text-on-light",
  changed: "bg-inserted text-on-light",
  removed: "bg-removed text-ink",
  info: "bg-accent text-ink",
} as const;

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-body-sm font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
