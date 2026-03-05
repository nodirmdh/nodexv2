type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  openTelegramLink?: (url: string) => void;
  ready?: () => void;
  expand?: () => void;
};

export function getTelegramWebApp(): TelegramWebApp | null {
  const tg = (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg ?? null;
}

export function getTelegramInitData(): string | null {
  return getTelegramWebApp()?.initData ?? null;
}

export function getTelegramUserSnapshot(): {
  id: string | null;
  username: string | null;
  fullName: string | null;
} {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  if (!user) {
    return { id: null, username: null, fullName: null };
  }
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || null;
  return {
    id: user.id === undefined || user.id === null ? null : `tg:${user.id}`,
    username: user.username ?? null,
    fullName,
  };
}

export function getTelegramLaunchUserSnapshot(): {
  id: string | null;
  username: string | null;
  fullName: string | null;
} {
  if (typeof window === "undefined") {
    return { id: null, username: null, fullName: null };
  }
  const params = new URLSearchParams(window.location.search);
  const uid = params.get("tg_uid");
  const username = params.get("tg_username");
  const first = params.get("tg_first");
  const last = params.get("tg_last");
  const fullName = [first, last].filter(Boolean).join(" ").trim() || null;
  return {
    id: uid ? `tg:${uid}` : null,
    username: username || null,
    fullName,
  };
}

export function parseTelegramUserId(initData: string | null): string | null {
  if (!initData) {
    return null;
  }
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) {
    return null;
  }
  try {
    const user = JSON.parse(userRaw) as { id?: number | string };
    if (user?.id !== undefined && user?.id !== null) {
      return `tg:${user.id}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function openTelegramSupport(link: string) {
  const tg = getTelegramWebApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(link);
  } else {
    window.open(link, "_blank");
  }
}
