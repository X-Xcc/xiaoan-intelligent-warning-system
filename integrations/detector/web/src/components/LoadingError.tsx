import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export function PageLoader({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="text-outline font-bold text-body-lg">{text}</p>
      </div>
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-error/10 border border-error/20 text-error px-lg py-md rounded-lg flex items-center justify-between">
      <span className="font-bold text-body-lg flex items-center gap-2">
        <AlertTriangle size={16} />
        {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 px-md py-1 bg-error/20 rounded font-bold hover:bg-error/30 transition-colors"
        >
          <RefreshCw size={14} />
          重试
        </button>
      )}
    </div>
  );
}
