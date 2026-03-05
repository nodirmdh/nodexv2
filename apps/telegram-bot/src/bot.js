const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env"),
});

const roleArg = (process.argv[2] || "combined").toLowerCase();
const BOT_MODE =
  roleArg === "client" || roleArg === "vendor" || roleArg === "combined"
    ? roleArg
    : "combined";
const BOT_TOKEN =
  BOT_MODE === "client"
    ? process.env.TELEGRAM_CLIENT_BOT_TOKEN || ""
    : BOT_MODE === "vendor"
      ? process.env.TELEGRAM_VENDOR_BOT_TOKEN || ""
      : process.env.TELEGRAM_BOT_TOKEN || "";
const CLIENT_WEBAPP_URL = process.env.TELEGRAM_CLIENT_WEBAPP_URL || "";
const VENDOR_WEBAPP_URL = process.env.TELEGRAM_VENDOR_WEBAPP_URL || "";
const ADMIN_URL = process.env.TELEGRAM_ADMIN_URL || "";
const SYNC_API_URL = process.env.TELEGRAM_SYNC_API_URL || "http://localhost:3000";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN) {
  console.error(
    BOT_MODE === "client"
      ? "TELEGRAM_CLIENT_BOT_TOKEN is required"
      : BOT_MODE === "vendor"
        ? "TELEGRAM_VENDOR_BOT_TOKEN is required"
        : "TELEGRAM_BOT_TOKEN is required",
  );
  process.exit(1);
}

if (BOT_MODE === "client" && !CLIENT_WEBAPP_URL) {
  console.error("TELEGRAM_CLIENT_WEBAPP_URL is required");
  process.exit(1);
}

if (BOT_MODE === "vendor" && !VENDOR_WEBAPP_URL) {
  console.error("TELEGRAM_VENDOR_WEBAPP_URL is required");
  process.exit(1);
}

if (BOT_MODE === "combined" && (!CLIENT_WEBAPP_URL || !VENDOR_WEBAPP_URL)) {
  console.error(
    "TELEGRAM_CLIENT_WEBAPP_URL and TELEGRAM_VENDOR_WEBAPP_URL are required",
  );
  process.exit(1);
}

async function apiCall(method, payload) {
  const response = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API ${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

function withCacheBuster(rawUrl, scope, extraParams = {}) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("miniapp", scope);
    url.searchParams.set("v", String(Date.now()));
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function buildMainKeyboard(from) {
  const rows = [];
  const launchParams = {
    tg_uid: from?.id ?? "",
    tg_username: from?.username ?? "",
    tg_first: from?.first_name ?? "",
    tg_last: from?.last_name ?? "",
  };

  if (BOT_MODE === "client" || BOT_MODE === "combined") {
    rows.push([
      {
        text: "Open Client App",
        web_app: { url: withCacheBuster(CLIENT_WEBAPP_URL, "client", launchParams) },
      },
    ]);
  }

  if (BOT_MODE === "vendor" || BOT_MODE === "combined") {
    rows.push([
      {
        text: "Open Vendor App",
        web_app: { url: withCacheBuster(VENDOR_WEBAPP_URL, "vendor", launchParams) },
      },
    ]);
  }

  if (ADMIN_URL) {
    rows.push([{ text: "Open Admin Panel", url: ADMIN_URL }]);
  }

  return { inline_keyboard: rows };
}

async function sendMenu(chatId, from) {
  const appLabel =
    BOT_MODE === "client"
      ? "- Client Mini App\n"
      : BOT_MODE === "vendor"
        ? "- Vendor Mini App (login/password inside app)\n"
        : "- Client Mini App\n- Vendor Mini App (login/password inside app)\n";

  await apiCall("sendMessage", {
    chat_id: chatId,
    text: "Nodex bot menu:\n" + appLabel + (ADMIN_URL ? "- Admin Web\n" : ""),
    reply_markup: buildMainKeyboard(from),
  });
}

function buildContactKeyboard() {
  return {
    keyboard: [[{ text: "Share Phone Number", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

async function syncClientProfileFromTelegram(message) {
  const from = message.from || {};
  const contact = message.contact || null;
  const payload = {
    telegram_user_id: from.id,
    username: from.username || null,
    first_name: from.first_name || null,
    last_name: from.last_name || null,
    phone: contact?.phone_number || null,
  };

  await fetch(`${SYNC_API_URL.replace(/\/+$/, "")}/telegram/client/sync-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-token": BOT_TOKEN,
    },
    body: JSON.stringify(payload),
  });
}

async function handleMessage(message) {
  const chatId = message.chat?.id;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!chatId) {
    return;
  }

  if (text.startsWith("/start") || text === "/menu" || text === "/client" || text === "/vendor") {
    if (BOT_MODE === "client" || BOT_MODE === "combined") {
      await apiCall("sendMessage", {
        chat_id: chatId,
        text: "Please share your phone to auto-fill profile in Mini App.",
        reply_markup: buildContactKeyboard(),
      });
      await syncClientProfileFromTelegram(message).catch(() => null);
      return;
    }
    await sendMenu(chatId, message.from);
    return;
  }

  if (message.contact && (BOT_MODE === "client" || BOT_MODE === "combined")) {
    await syncClientProfileFromTelegram(message).catch(() => null);
    await apiCall("sendMessage", {
      chat_id: chatId,
      text: "Contact saved. Open Client App.",
      reply_markup: buildMainKeyboard(message.from),
    });
    return;
  }

  await apiCall("sendMessage", {
    chat_id: chatId,
    text: "Use /start to open the app menu.",
  });
}

async function poll() {
  let offset = 0;
  while (true) {
    try {
      const result = await apiCall("getUpdates", {
        timeout: 30,
        offset,
        allowed_updates: ["message"],
      });
      for (const update of result) {
        offset = update.update_id + 1;
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      console.error("Polling error:", error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

poll().catch((error) => {
  console.error("Bot stopped:", error);
  process.exit(1);
});
