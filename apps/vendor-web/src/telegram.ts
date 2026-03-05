type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  initData?: string;
};

type TelegramHost = {
  WebApp?: TelegramWebApp;
};

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  const telegram = (window as typeof window & { Telegram?: TelegramHost }).Telegram;
  return telegram?.WebApp ?? null;
}

export function initTelegramWebApp() {
  const webApp = getTelegramWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}

export function getTelegramInitData(): string | null {
  return getTelegramWebApp()?.initData ?? null;
}
