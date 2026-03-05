import { useEffect, useMemo, useState } from "react";

type ToastKind = "success" | "error" | "loading";

type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
  durationMs: number;
};

type ToastEventPayload = {
  id?: string;
  message?: string;
  kind?: ToastKind;
  durationMs?: number;
  dismiss?: boolean;
};

const EVENT_NAME = "nodex:toast";
const DEFAULT_DURATION = 2500;

function emitToast(payload: ToastEventPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<ToastEventPayload>(EVENT_NAME, { detail: payload }));
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const toast = {
  success(message: string, durationMs = DEFAULT_DURATION) {
    const id = nextId();
    emitToast({ id, message, kind: "success", durationMs });
    return id;
  },
  error(message: string, durationMs = DEFAULT_DURATION + 1200) {
    const id = nextId();
    emitToast({ id, message, kind: "error", durationMs });
    return id;
  },
  loading(message: string, durationMs = DEFAULT_DURATION) {
    const id = nextId();
    emitToast({ id, message, kind: "loading", durationMs });
    return id;
  },
  dismiss(id?: string) {
    emitToast({ id, dismiss: true });
  },
};

export function ToastProvider() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handler = (event: Event) => {
      const custom = event as CustomEvent<ToastEventPayload>;
      const detail = custom.detail ?? {};
      if (detail.dismiss) {
        setItems((prev) => (detail.id ? prev.filter((item) => item.id !== detail.id) : []));
        return;
      }
      if (!detail.message || !detail.kind) {
        return;
      }
      const id = detail.id ?? nextId();
      const durationMs = Number.isFinite(detail.durationMs) ? Number(detail.durationMs) : DEFAULT_DURATION;
      setItems((prev) => [...prev, { id, message: detail.message, kind: detail.kind, durationMs }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
    };

    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => {
      window.removeEventListener(EVENT_NAME, handler as EventListener);
    };
  }, []);

  const palette = useMemo(
    () => ({
      success: { bg: "#0f172a", border: "#1d4ed8" },
      error: { bg: "#7f1d1d", border: "#ef4444" },
      loading: { bg: "#1f2937", border: "#64748b" },
    }),
    [],
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        display: "grid",
        gap: 8,
        maxWidth: "min(92vw, 320px)",
        pointerEvents: "none",
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            background: palette[item.kind].bg,
            border: `1px solid ${palette[item.kind].border}`,
            borderRadius: 10,
            padding: "10px 12px",
            color: "#fff",
            fontSize: 13,
            lineHeight: 1.35,
            boxShadow: "0 8px 24px rgba(2,6,23,0.35)",
            pointerEvents: "none",
            wordBreak: "break-word",
          }}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}

