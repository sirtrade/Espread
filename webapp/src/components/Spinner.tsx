export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-subtext">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-subtext border-t-accent" />
      {label && <p className="max-w-xs text-center text-sm">{label}</p>}
    </div>
  );
}
