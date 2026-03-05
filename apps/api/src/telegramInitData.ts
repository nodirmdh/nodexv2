import crypto from "crypto";

const TELEGRAM_WEBAPP_KEY = "WebAppData";

type ParsedTelegramUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

function parseUserFromInitData(initData: string): ParsedTelegramUser | null {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) {
    return null;
  }
  try {
    return JSON.parse(userRaw) as ParsedTelegramUser;
  } catch {
    return null;
  }
}

function parseUserIdFromInitData(initData: string): string | null {
  const user = parseUserFromInitData(initData);
  if (!user || user.id === undefined || user.id === null) {
    return null;
  }
  return `tg:${user.id}`;
}

function buildDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") {
      continue;
    }
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  return pairs.join("\n");
}

export function parseTelegramUserIdUnsafe(initData: string | undefined): string | null {
  if (!initData) {
    return null;
  }
  return parseUserIdFromInitData(initData);
}

export function parseTelegramUserUnsafe(initData: string | undefined): {
  userId: string | null;
  username: string | null;
  fullName: string | null;
} {
  if (!initData) {
    return { userId: null, username: null, fullName: null };
  }
  const user = parseUserFromInitData(initData);
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || null;
  return {
    userId: parseUserIdFromInitData(initData),
    username: user?.username ?? null,
    fullName,
  };
}

export function verifyTelegramInitData(
  initData: string | undefined,
  botToken: string,
  maxAgeSec: number,
): { ok: boolean; userId: string | null } {
  if (!initData) {
    return { ok: false, userId: null };
  }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, userId: null };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, userId: null };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (maxAgeSec > 0 && nowSec - authDate > maxAgeSec) {
    return { ok: false, userId: null };
  }

  const dataCheckString = buildDataCheckString(params);
  const secret = crypto
    .createHmac("sha256", TELEGRAM_WEBAPP_KEY)
    .update(botToken)
    .digest();
  const computedHash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  if (
    hashBuffer.length === 0 ||
    hashBuffer.length !== computedBuffer.length ||
    !crypto.timingSafeEqual(hashBuffer, computedBuffer)
  ) {
    return { ok: false, userId: null };
  }

  return { ok: true, userId: parseUserIdFromInitData(initData) };
}
