import {
  AddressEntry,
  ClientProfile,
  MenuItem,
  OrderDetails,
  OrderRatingPayload,
  OrderRatingResponse,
  OrderResponse,
  OrdersResponse,
  PromoCodeEntry,
  QuoteResponse,
  TrackingResponse,
  VendorDetails,
  VendorSummary,
} from "./types";
import {
  getTelegramInitData,
  getTelegramLaunchUserSnapshot,
  getTelegramUserSnapshot,
  parseTelegramUserId,
} from "../telegram";

const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";
const API_URL = rawApiUrl.replace(/\/+$/, "");
const DEV_MODE =
  import.meta.env.VITE_DEV_MODE === "true" || import.meta.env.VITE_DEV_MODE === "1";
const TOKEN_KEY = "nodex_client_token";
const DEV_CLIENT_KEY = "nodex_dev_client_id";
let memoryDevClientId: string | null = null;

function getOrCreateDevClientId() {
  if (memoryDevClientId) {
    return memoryDevClientId;
  }
  try {
    const existing = window.localStorage.getItem(DEV_CLIENT_KEY);
    if (existing) {
      memoryDevClientId = existing;
      return existing;
    }
  } catch {
    // ignore
  }
  const generated = `dev:${Math.random().toString(36).slice(2, 10)}`;
  memoryDevClientId = generated;
  try {
    window.localStorage.setItem(DEV_CLIENT_KEY, generated);
  } catch {
    // ignore storage failures in limited webviews
  }
  return generated;
}

export function getClientToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setClientToken(token: string | null) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures in limited webviews
  }
}

function getJwtRole(token: string | null): string | null {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: string;
    };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function buildHeaders() {
  const initData = getTelegramInitData();
  const snapshot = getTelegramUserSnapshot();
  const launchSnapshot = getTelegramLaunchUserSnapshot();
  const tgUserId = parseTelegramUserId(initData) ?? snapshot.id ?? launchSnapshot.id;
  const hasTelegramContext = Boolean(
    (window as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp,
  );
  const clientId =
    tgUserId ??
    (DEV_MODE && !hasTelegramContext ? getOrCreateDevClientId() : "");
  const token = getClientToken();
  const tokenRole = getJwtRole(token);
  const validClientToken = token && tokenRole === "CLIENT" ? token : null;
  if (token && !validClientToken) {
    setClientToken(null);
  }
  const useAuthToken = Boolean(validClientToken) && Boolean(initData || tgUserId || !DEV_MODE);

  const headers: Record<string, string> = {
    "x-role": "CLIENT",
    ...(initData ? { "x-telegram-init-data": initData } : {}),
  };
  if (clientId) {
    headers["x-client-id"] = clientId;
  }
  if (useAuthToken && validClientToken) {
    headers.Authorization = `Bearer ${validClientToken}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined && options?.body !== null;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();
  const looksLikeHtml = /^\s*</.test(rawBody);

  if (!response.ok) {
    let body: { message?: string } = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as { message?: string }) : {};
    } catch {
      body = {};
    }
    const message =
      typeof body.message === "string"
        ? body.message
        : looksLikeHtml
          ? "API returned HTML instead of JSON. Check VITE_API_URL and Cloudflare tunnel."
          : "Request failed";
    throw new Error(message);
  }

  if (!contentType.includes("application/json")) {
    if (looksLikeHtml) {
      throw new Error("API returned HTML instead of JSON. Check VITE_API_URL and Cloudflare tunnel.");
    }
    throw new Error("API response is not JSON.");
  }

  return JSON.parse(rawBody) as T;
}

export async function listCategories(): Promise<string[]> {
  const data = await request<{ categories: string[] }>("/client/categories");
  return data.categories;
}

export async function registerClient(payload: {
  full_name: string;
  birth_date: string;
  phone: string;
  password: string;
}): Promise<{ token: string; client_id: string; full_name: string | null; phone: string | null }> {
  const data = await request<{
    token: string;
    client_id: string;
    full_name: string | null;
    phone: string | null;
  }>("/client/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setClientToken(data.token);
  return data;
}

export async function loginClient(payload: {
  phone: string;
  password: string;
}): Promise<{ token: string; client_id: string; full_name: string | null; phone: string | null }> {
  const data = await request<{
    token: string;
    client_id: string;
    full_name: string | null;
    phone: string | null;
  }>("/client/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setClientToken(data.token);
  return data;
}

export async function telegramLogin(): Promise<{ token: string; client_id: string }> {
  const data = await request<{ token: string; client_id: string }>("/client/auth/telegram", {
    method: "POST",
  });
  setClientToken(data.token);
  return data;
}

export async function listVendors(): Promise<VendorSummary[]> {
  const data = await request<{ vendors: VendorSummary[] }>("/client/vendors");
  return data.vendors;
}

export async function getVendor(vendorId: string): Promise<VendorDetails> {
  return request<VendorDetails>(`/client/vendors/${vendorId}`);
}

export async function createQuote(payload: {
  vendor_id: string;
  fulfillment_type: string;
  delivery_location?: { lat: number; lng: number } | null;
  delivery_comment?: string | null;
  vendor_comment?: string | null;
  utensils_count?: number | null;
  receiver_phone?: string | null;
  payment_method?: string | null;
  change_for_amount?: number | null;
  address_text?: string | null;
  address_street?: string | null;
  address_house?: string | null;
  address_entrance?: string | null;
  address_apartment?: string | null;
  promo_code?: string | null;
  items: Array<{ menu_item_id: string; quantity: number }>;
}): Promise<QuoteResponse> {
  return request<QuoteResponse>("/client/cart/quote", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createOrder(payload: {
  vendor_id: string;
  fulfillment_type: string;
  delivery_location?: { lat: number; lng: number } | null;
  delivery_comment?: string | null;
  vendor_comment?: string | null;
  utensils_count?: number | null;
  receiver_phone?: string | null;
  payment_method?: string | null;
  change_for_amount?: number | null;
  address_text?: string | null;
  address_street?: string | null;
  address_house?: string | null;
  address_entrance?: string | null;
  address_apartment?: string | null;
  promo_code?: string | null;
  items: Array<{ menu_item_id: string; quantity: number }>;
}): Promise<OrderResponse> {
  return request<OrderResponse>("/client/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrder(orderId: string): Promise<OrderDetails> {
  return request<OrderDetails>(`/client/orders/${orderId}`);
}

export async function listOrders(params?: {
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<OrdersResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.cursor) query.set("cursor", params.cursor);
  const suffix = query.toString();
  return request<OrdersResponse>(`/client/orders${suffix ? `?${suffix}` : ""}`);
}

export async function getTracking(orderId: string): Promise<TrackingResponse> {
  return request<TrackingResponse>(`/client/orders/${orderId}/tracking`);
}

export async function getOrderRating(orderId: string): Promise<OrderRatingResponse> {
  return request<OrderRatingResponse>(`/client/orders/${orderId}/rating`);
}

export async function submitOrderRating(
  orderId: string,
  payload: OrderRatingPayload,
): Promise<OrderRatingResponse> {
  return request<OrderRatingResponse>(`/client/orders/${orderId}/rating`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPromoCodes(): Promise<PromoCodeEntry[]> {
  const data = await request<{ promo_codes: PromoCodeEntry[] }>("/client/profile/promo-codes");
  return data.promo_codes;
}

export async function addPromoCode(code: string): Promise<PromoCodeEntry> {
  return request<PromoCodeEntry>("/client/profile/promo-codes", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function removePromoCode(id: string): Promise<void> {
  await request<{ deleted: boolean }>(`/client/profile/promo-codes/${id}`, {
    method: "DELETE",
  });
}

export async function getProfile(): Promise<ClientProfile> {
  return request<ClientProfile>("/client/profile");
}

export async function updateProfile(payload: {
  full_name?: string | null;
  phone?: string | null;
  telegram_username?: string | null;
  about?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  avatar_file_id?: string | null;
}): Promise<ClientProfile> {
  return request<ClientProfile>("/client/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listAddresses(): Promise<AddressEntry[]> {
  const data = await request<{ addresses: AddressEntry[] }>("/client/profile/addresses");
  return data.addresses;
}

export async function addAddress(payload: {
  type: "HOME" | "WORK" | "OTHER";
  address_text: string;
  lat: number;
  lng: number;
  entrance?: string | null;
  apartment?: string | null;
}): Promise<AddressEntry> {
  return request<AddressEntry>("/client/profile/addresses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAddress(
  id: string,
  payload: Partial<{
    type: "HOME" | "WORK" | "OTHER";
    address_text: string;
    lat: number;
    lng: number;
    entrance: string | null;
    apartment: string | null;
  }>,
): Promise<AddressEntry> {
  return request<AddressEntry>(`/client/profile/addresses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function removeAddress(id: string): Promise<void> {
  await request<{ deleted: boolean }>(`/client/profile/addresses/${id}`, {
    method: "DELETE",
  });
}

export function buildMenuItemLabel(item: MenuItem) {
  return item.title || `Item ${item.menu_item_id.slice(0, 6)}`;
}
