import { useT } from "../lib/i18n.js";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="max-w-xs text-sm text-subtext">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white active:opacity-80"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
