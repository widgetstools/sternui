import { useToast } from "../../hooks/use-toast";
import { Toast, ToastTitle, ToastDescription } from "./toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-[420px] flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant} onClose={() => dismiss(t.id)}>
          {t.title && <ToastTitle>{t.title}</ToastTitle>}
          {t.description && (
            <ToastDescription>{t.description}</ToastDescription>
          )}
        </Toast>
      ))}
    </div>
  );
}
