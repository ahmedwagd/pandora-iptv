import { ColorBar } from "../ColorBar";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center text-[13px] leading-relaxed text-(--on-surface-variant)">
      <ColorBar className="colorbar--dim" />
      <span className="max-w-[32ch] text-balance">{message}</span>
    </div>
  );
}
