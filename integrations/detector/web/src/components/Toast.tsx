import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "../lib/utils";

interface Toast { id: string; message: string; type?: "success" | "error"; }
interface ToastCtx { show: (msg: string, type?: "success" | "error") => void; }

const ToastContext = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-body font-semibold animate-fade-in-up",
              t.type === "error"
                ? "bg-danger-red text-white"
                : "bg-white border border-outline-variant text-on-surface"
            )}>
            <CheckCircle2 size={16} className={t.type === "error" ? "text-white" : "text-success-green"} />
            {t.message}
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="ml-2 p-0.5 rounded hover:bg-black/10">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
