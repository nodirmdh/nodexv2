
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { DEFAULT_CENTER_QONIRAT, haversineKm } from "@nodex/navigation";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
} from "@nodex/ui";
import { ClipboardList, Home, ShoppingCart, User } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { LANGUAGES, formatCurrency, formatDateTime, formatNumber, getLanguage, setLanguage, translateFulfillment, translatePayment } from "@nodex/i18n";

import {
  addAddress,
  addPromoCode,
  createOrder,
  createQuote,
  getOrder,
  getOrderRating,
  getClientToken,
  getProfile,
  getVendor,
  listAddresses,
  listCategories,
  listOrders,
  listPromoCodes,
  listVendors,
  removeAddress,
  removePromoCode,
  submitOrderRating,
  setClientToken,
  updateProfile,
} from "./api/client";
import type {
  AddressEntry,
  ClientProfile,
  MenuItem,
  OrderDetails,
  OrderSummary,
  PromoCodeEntry,
  QuoteResponse,
  VendorDetails,
  VendorSummary,
} from "./api/types";
import { useLocalStorage } from "./hooks/useLocalStorage";
import {
  getTelegramLaunchUserSnapshot,
  getTelegramUserSnapshot,
  getTelegramWebApp,
  parseTelegramUserId,
} from "./telegram";
import { resolveAssetUrl } from "./utils/resolveAssetUrl";

type Screen = "home" | "vendor" | "cart" | "address" | "checkout" | "orders" | "orderDetails" | "profile";

type ProfileTab = "account" | "addresses" | "promo";

type CartState = {
  vendorId: string | null;
  fulfillmentType: "DELIVERY" | "PICKUP";
  items: Record<string, number>;
  vendorComment: string;
  utensilsCount: number;
  promoCode: string | null;
};

type AddressType = "HOME" | "WORK" | "OTHER";

type AddressState = {
  type: AddressType;
  lat: number | null;
  lng: number | null;
  addressText: string;
  street: string;
  house: string;
  entrance: string;
  apartment: string;
};

type CheckoutState = {
  deliveryComment: string;
  receiverPhone: string;
  paymentMethod: "CASH" | "CARD";
  changeRequired: boolean;
  changeForAmount: string;
  manualPromo: string;
};

type RatingDraft = {
  vendorStars: number;
  vendorComment: string;
};

const emptyCart: CartState = {
  vendorId: null,
  fulfillmentType: "DELIVERY",
  items: {},
  vendorComment: "",
  utensilsCount: 0,
  promoCode: null,
};

const emptyAddress: AddressState = {
  type: "HOME",
  lat: null,
  lng: null,
  addressText: "",
  street: "",
  house: "",
  entrance: "",
  apartment: "",
};

const emptyCheckout: CheckoutState = {
  deliveryComment: "",
  receiverPhone: "+998",
  paymentMethod: "CARD",
  changeRequired: false,
  changeForAmount: "",
  manualPromo: "",
};

const MAX_CLIENT_DISTANCE_KM = 120;
const MAP_ZOOM = 15;

export function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>("home");
  const [profileTab, setProfileTab] = useState<ProfileTab>("account");
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<VendorDetails | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useLocalStorage<CartState>("nodex_client_cart", emptyCart);
  const [address, setAddress] = useLocalStorage<AddressState>(
    "nodex_client_address",
    emptyAddress,
  );
  const [savedAddresses, setSavedAddresses] = useState<AddressEntry[]>([]);
  const [checkout, setCheckout] = useLocalStorage<CheckoutState>(
    "nodex_client_checkout",
    emptyCheckout,
  );
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersHistory, setOrdersHistory] = useState<OrderSummary[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCodeEntry[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useLocalStorage<string | null>(
    "nodex_client_active_order_id",
    null,
  );
  const [deliveryCode, setDeliveryCode] = useLocalStorage<string | null>(
    "nodex_client_delivery_code",
    null,
  );
  const [pickupCode, setPickupCode] = useLocalStorage<string | null>(
    "nodex_client_pickup_code",
    null,
  );

  const translateBadge = (badge: string) => {
    if (badge === "Promo code available") {
      return t("common.promoCodeAvailable");
    }
    if (badge === "Gift") {
      return t("promo.gift");
    }
    return badge;
  };
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [authToken, setAuthTokenState] = useState<string | null>(getClientToken());
  const [authBootstrapTried, setAuthBootstrapTried] = useState(false);
  const [ratingDraft, setRatingDraft] = useState<RatingDraft>({
    vendorStars: 5,
    vendorComment: "",
  });
  const [addressForm, setAddressForm] = useState({
    type: "HOME" as AddressType,
    address_text: "",
    entrance: "",
    apartment: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapDraftLat, setMapDraftLat] = useState("");
  const [mapDraftLng, setMapDraftLng] = useState("");

  useEffect(() => {
    document.body.classList.toggle("modal-open", showMap);
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [showMap]);

  useEffect(() => {
    if (!showMap) {
      return;
    }
    setMapDraftLat(
      address.lat !== null ? address.lat.toFixed(6) : DEFAULT_CENTER_QONIRAT.lat.toFixed(6),
    );
    setMapDraftLng(
      address.lng !== null ? address.lng.toFixed(6) : DEFAULT_CENTER_QONIRAT.lng.toFixed(6),
    );
  }, [showMap, address.lat, address.lng]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready?.();
    webApp?.expand?.();
    void loadHome();
  }, []);

  useEffect(() => {
    if (authBootstrapTried) {
      return;
    }
    setAuthBootstrapTried(true);
    void loadProfile().catch(() => null);
  }, [authBootstrapTried]);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    void loadProfile();
  }, [authToken]);

  useEffect(() => {
    const initId = parseTelegramUserId(getTelegramWebApp()?.initData ?? null);
    const snapshotId = getTelegramUserSnapshot().id;
    const currentTelegramId = initId ?? snapshotId;
    if (!currentTelegramId) {
      return;
    }
    const storageKey = "nodex_client_tg_id";
    let previousTelegramId: string | null = null;
    try {
      previousTelegramId = window.localStorage.getItem(storageKey);
    } catch {
      previousTelegramId = null;
    }
    if (previousTelegramId && previousTelegramId !== currentTelegramId) {
      setClientToken(null);
      setAuthTokenState(null);
      setCart(emptyCart);
      setActiveOrderId(null);
      setDeliveryCode(null);
      setPickupCode(null);
      setSelectedOrderId(null);
      setOrder(null);
      setOrders([]);
      setOrdersHistory([]);
    }
    try {
      window.localStorage.setItem(storageKey, currentTelegramId);
    } catch {
      // ignore storage failures in limited webviews
    }
  }, [setActiveOrderId, setCart, setDeliveryCode, setPickupCode]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (!activeOrderId) {
      return;
    }
    void refreshOrder(activeOrderId);
  }, [activeOrderId]);

  const applyPickedLocation = async (lat: number, lng: number) => {
    setAddress((prev) => ({ ...prev, lat, lng }));
    const geocoded = await reverseGeocodeAddress(lat, lng);
    setAddress((prev) => ({
      ...prev,
      lat,
      lng,
      addressText: geocoded.addressText ?? (prev.addressText || t("client.selectedLocation")),
      street: geocoded.street ?? prev.street,
      house: geocoded.house ?? prev.house,
    }));
    setShowMap(false);
  };

  const loadHome = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [vendorsData, categoriesData] = await Promise.all([
        listVendors(),
        listCategories(),
      ]);
      setVendors(vendorsData);
      setCategories(["All", ...categoriesData]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadVendors"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadVendor = async (vendorId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getVendor(vendorId);
      setSelectedVendor(data);
      setCart((prev) => ({
        ...prev,
        vendorId: data.vendor_id,
        fulfillmentType:
          data.supports_pickup && prev.fulfillmentType === "PICKUP"
            ? "PICKUP"
            : "DELIVERY",
      }));
      setExpandedItems({});
      setScreen("vendor");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadVendor"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const activeStatuses = [
        "NEW",
        "ACCEPTED",
        "COOKING",
        "READY",
      ];
      const [activeData, historyData] = await Promise.all([
        listOrders({ status: activeStatuses.join(",") }),
        listOrders({
          status: "DELIVERED,COMPLETED,CANCELLED,CANCELLED_BY_VENDOR,PICKED_UP_BY_CUSTOMER",
        }),
      ]);
      setOrders(activeData.orders);
      setOrdersHistory(historyData.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadOrders"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProfile();
      const telegramUser = getTelegramUserSnapshot();
      const launchUser = getTelegramLaunchUserSnapshot();
      setProfile({
        ...data,
        full_name: data.full_name ?? telegramUser.fullName ?? launchUser.fullName,
        telegram_username: data.telegram_username ?? telegramUser.username ?? launchUser.username,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadProfile"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadAddresses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAddresses();
      setSavedAddresses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadAddresses"));
    } finally {
      setIsLoading(false);
    }
  };

  const updateItemQuantity = (itemId: string, delta: number) => {
    if (
      delta > 0 &&
      selectedVendor &&
      isVendorUnavailable(selectedVendor)
    ) {
      setError(vendorUnavailableMessage(selectedVendor));
      return;
    }
    setCart((prev) => {
      const next = { ...prev.items };
      const current = next[itemId] ?? 0;
      const updated = current + delta;
      if (updated <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = updated;
      }
      return { ...prev, items: next };
    });
  };

  const cartItems = useMemo(() => {
    if (!selectedVendor) {
      return [] as Array<{ item: MenuItem; quantity: number }>;
    }
    return selectedVendor.menu
      .filter((item) => cart.items[item.menu_item_id])
      .map((item) => ({ item, quantity: cart.items[item.menu_item_id] }));
  }, [cart.items, selectedVendor]);

  const totals = useMemo(() => {
    const itemsCount = cartItems.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = cartItems.reduce(
      (sum, line) => sum + line.quantity * line.item.price,
      0,
    );
    return { itemsCount, subtotal };
  }, [cartItems]);

  const canPickup = selectedVendor?.supports_pickup ?? false;
  const vendorGeo = useMemo(() => {
    if (selectedVendor?.geo) {
      return selectedVendor.geo;
    }
    if (!cart.vendorId) {
      return null;
    }
    return vendors.find((vendor) => vendor.vendor_id === cart.vendorId)?.geo ?? null;
  }, [selectedVendor, vendors, cart.vendorId]);
  const deliveryDistanceKm = useMemo(() => {
    if (cart.fulfillmentType !== "DELIVERY") {
      return null;
    }
    if (!vendorGeo || address.lat === null || address.lng === null) {
      return null;
    }
    return haversineKm(vendorGeo, { lat: address.lat, lng: address.lng });
  }, [address.lat, address.lng, cart.fulfillmentType, vendorGeo]);
  const deliveryTooFar =
    deliveryDistanceKm !== null && deliveryDistanceKm > MAX_CLIENT_DISTANCE_KM;
  const buildOrderPayload = () => {
    const deliveryLocation =
      cart.fulfillmentType === "DELIVERY" && address.lat !== null && address.lng !== null
        ? {
            lat: address.lat,
            lng: address.lng,
          }
        : null;

    const promo = cart.promoCode && cart.promoCode.trim() ? cart.promoCode.trim() : null;

    return {
      vendor_id: cart.vendorId ?? "",
      fulfillment_type: cart.fulfillmentType,
      delivery_location: deliveryLocation,
      delivery_comment:
        cart.fulfillmentType === "DELIVERY" ? checkout.deliveryComment.trim() || null : null,
      vendor_comment: cart.vendorComment.trim() || null,
      utensils_count: cart.utensilsCount,
      receiver_phone: normalizeUzPhone(checkout.receiverPhone),
      payment_method: checkout.paymentMethod,
      change_for_amount:
        checkout.paymentMethod === "CASH" && checkout.changeRequired
          ? Number(checkout.changeForAmount) || null
          : null,
      address_text: address.addressText.trim() || null,
      address_street: address.street.trim() || null,
      address_house: address.house.trim() || null,
      address_entrance: address.entrance.trim() || null,
      address_apartment: address.apartment.trim() || null,
      promo_code: promo,
      items: cartItems.map(({ item, quantity }) => ({
        menu_item_id: item.menu_item_id,
        quantity,
      })),
    };
  };
  const handleCreateQuote = async () => {
    setError(null);
    if (!cart.vendorId) {
      setError(t("errors.selectVendor"));
      return null;
    }
    if (cartItems.length === 0) {
      setError(t("errors.addItems"));
      return null;
    }
    if (cart.fulfillmentType === "DELIVERY") {
      if (!checkout.deliveryComment.trim()) {
        setError(t("errors.deliveryCommentRequired"));
        return null;
      }
      if (address.lat === null || address.lng === null) {
        setError(t("errors.selectDeliveryAddress"));
        return null;
      }
      if (deliveryTooFar) {
        setError(t("errors.deliveryTooFar"));
        return null;
      }
    }
    const normalizedPhone = normalizeUzPhone(checkout.receiverPhone);
    if (!normalizedPhone) {
      setError(t("errors.phoneFormat"));
      return null;
    }
    setIsLoading(true);
    try {
      const data = await createQuote(buildOrderPayload());
      setQuote(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.quoteFailed"));
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrder = async () => {
    setError(null);
    if (cart.fulfillmentType === "DELIVERY") {
      if (!checkout.deliveryComment.trim()) {
        setError(t("errors.deliveryCommentRequired"));
        return;
      }
      if (address.lat === null || address.lng === null) {
        setError(t("errors.selectDeliveryAddress"));
        return;
      }
      if (deliveryTooFar) {
        setError(t("errors.deliveryTooFar"));
        return;
      }
    }
    const normalizedPhone = normalizeUzPhone(checkout.receiverPhone);
    if (!normalizedPhone) {
      setError(t("errors.phoneFormat"));
      return;
    }
    setIsLoading(true);
    try {
      const data = await createOrder(buildOrderPayload());
      setActiveOrderId(data.order_id);
      setDeliveryCode(data.delivery_code ?? null);
      setPickupCode(data.pickup_code ?? null);
      setQuote(null);
      setScreen("orders");
      setCart((prev) => ({ ...prev, items: {} }));
      await refreshOrder(data.order_id);
      await loadOrders();
      toast.success("Заказ создан");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createOrder"));
    } finally {
      setIsLoading(false);
    }
  };

  const refreshOrder = async (orderId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const orderData = await getOrder(orderId);
      setOrder(orderData);
      if (orderData.delivery_code) {
        setDeliveryCode(orderData.delivery_code);
      }
      if (orderData.pickup_code) {
        setPickupCode(orderData.pickup_code);
      }
      if (orderData.status === "COMPLETED" || orderData.status === "DELIVERED") {
        setActiveOrderId(null);
        setDeliveryCode(null);
        setPickupCode(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.loadOrder");
      if (message === "Forbidden" || message.toLowerCase().includes("forbidden")) {
        // Order belongs to another client session; clear stale local state.
        setActiveOrderId(null);
        setSelectedOrderId(null);
        setOrder(null);
        setDeliveryCode(null);
        setPickupCode(null);
        return;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredVendors = vendors.filter((vendor) => {
    const matchesCategory = selectedCategory === "All" || vendor.category === selectedCategory;
    const matchesSearch = vendor.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const goToCart = async () => {
    if (cartItems.length === 0) {
      setError(t("errors.addItem"));
      return;
    }
    if (selectedVendor && isVendorUnavailable(selectedVendor)) {
      setError(vendorUnavailableMessage(selectedVendor));
      return;
    }
    setScreen("cart");
    try {
      const data = await listPromoCodes();
      setPromoCodes(data);
      setCart((prev) => ({
        ...prev,
        promoCode:
          prev.promoCode && data.some((entry) => entry.code === prev.promoCode)
            ? prev.promoCode
            : null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadPromoCodes"));
    }
  };

  const goToOrders = async () => {
    setScreen("orders");
    await loadOrders();
  };

  const openOrderDetails = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setScreen("orderDetails");
    await refreshOrder(orderId);
  };

  useEffect(() => {
    if (screen !== "orderDetails" || !selectedOrderId) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshOrder(selectedOrderId);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [screen, selectedOrderId]);

  const goToAddress = () => {
    if (cartItems.length === 0) {
      setError(t("errors.addItem"));
      return;
    }
    if (selectedVendor && isVendorUnavailable(selectedVendor)) {
      setError(vendorUnavailableMessage(selectedVendor));
      return;
    }
    setScreen("address");
    void loadAddresses();
  };

  const goToCheckout = async () => {
    if (cartItems.length === 0) {
      setError(t("errors.addItem"));
      return;
    }
    if (selectedVendor && isVendorUnavailable(selectedVendor)) {
      setError(vendorUnavailableMessage(selectedVendor));
      return;
    }
    if (cart.fulfillmentType === "DELIVERY" && (address.lat === null || address.lng === null)) {
      setError(t("errors.selectDeliveryAddress"));
      return;
    }
    if (cart.fulfillmentType === "DELIVERY" && deliveryTooFar) {
      setError(t("errors.deliveryTooFar"));
      return;
    }
    setScreen("checkout");
    await handleCreateQuote();
  };

  const handleSaveAddress = async () => {
    if (address.lat === null || address.lng === null) {
      setError(t("errors.pickMap"));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await addAddress({
        type: address.type,
        address_text: address.addressText,
        lat: address.lat,
        lng: address.lng,
        entrance: address.entrance || null,
        apartment: address.apartment || null,
      });
      await loadAddresses();
      toast.success("Сохранено");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.saveAddress"));
    } finally {
      setIsLoading(false);
    }
  };

  const ratingLabel = (vendor: VendorSummary | VendorDetails) => {
    const avg = vendor.rating_avg ?? 0;
    const count = vendor.rating_count ?? 0;
    return `${avg.toFixed(1)} (${count})`;
  };

  const isVendorUnavailable = (vendor?: VendorSummary | VendorDetails | null) => {
    if (!vendor) return false;
    return vendor.is_active === false || vendor.is_blocked || vendor.is_open_now === false;
  };

  const vendorUnavailableMessage = (vendor?: VendorSummary | VendorDetails | null) => {
    if (!vendor) return t("client.vendorDisabled");
    return vendor.is_open_now === false ? t("client.vendorClosed") : t("client.vendorDisabled");
  };
  return (
    <div className="app">
      <nav className="bottom-nav">
        <button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")}>
          <Home size={16} /> {t("nav.home")}
        </button>
        <button className={screen === "cart" ? "active" : ""} onClick={goToCart}>
          <ShoppingCart size={16} /> {t("nav.cart")}
        </button>
        <button className={screen === "orders" ? "active" : ""} onClick={goToOrders}>
          <ClipboardList size={16} /> {t("nav.orders")}
        </button>
        <button
          className={screen === "profile" ? "active" : ""}
          onClick={() => {
            setScreen("profile");
            setProfileTab("account");
            void loadProfile();
            void loadAddresses();
            void listPromoCodes().then(setPromoCodes).catch(() => null);
          }}
        >
          <User size={16} /> {t("nav.profile")}
        </button>
      </nav>

      {error && <div className="error">{error}</div>}
      {isLoading && <div className="loading">{t("common.loading")}</div>}

      {screen === "home" && (
        <section className="panel">
          <div className="category-chips">
            {categories.map((category) => (
              <button
                key={category}
                className={selectedCategory === category ? "tag active" : "tag"}
                onClick={() => setSelectedCategory(category)}
              >
                {category === "All" ? t("common.all") : t(`category.${category}`)}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder={t("client.searchVendors")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="card-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="card">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                </div>
              ))
            ) : (
              <>
                {filteredVendors.map((vendor) => (
                  <button
                    key={vendor.vendor_id}
                    className="card"
                    disabled={vendor.is_active === false || vendor.is_blocked || vendor.is_open_now === false}
                    onClick={() => {
                      if (vendor.is_open_now === false) {
                        setError(t("client.vendorClosed"));
                        return;
                      }
                      if (vendor.is_active === false || vendor.is_blocked) {
                        setError(t("client.vendorClosed"));
                        return;
                      }
                      void loadVendor(vendor.vendor_id);
                    }}
                  >
                    {vendor.main_image_url ? (
                      <img
                        className="card-image"
                        src={resolveAssetUrl(vendor.main_image_url)}
                        alt={vendor.name}
                        onError={(event: SyntheticEvent<HTMLImageElement>) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = buildFallbackImage(vendor.name, 640, 360);
                        }}
                      />
                    ) : (
                      <div className="card-image placeholder" />
                    )}
                    <div className="card-title">{vendor.name}</div>
                    <div className="card-meta">
                      {t("client.vendorCategory")}: {t(`category.${vendor.category}`)}
                    </div>
                    <div className="card-meta">
                      {t("client.vendorRating")}: {ratingLabel(vendor)}
                    </div>
                    <div className="tag-list">
                      {vendor.is_open_now === false ? (
                        <span className="tag">{t("client.closedNow")}</span>
                      ) : (
                        <span className="tag">{t("client.openNow")}</span>
                      )}
                    </div>
                    {(vendor.is_active === false || vendor.is_blocked) && (
                      <div className="tag-list">
                        <span className="tag">{t("client.vendorDisabled")}</span>
                      </div>
                    )}
                    <div className="tag-list">
                      {vendor.active_promotions?.length ? (
                        vendor.active_promotions.map((badge) => (
                          <span key={badge} className="tag">
                            {translateBadge(badge)}
                          </span>
                        ))
                      ) : (
                        <span className="muted">{t("client.noPromotions")}</span>
                      )}
                    </div>
                  </button>
                ))}
                {filteredVendors.length === 0 && <p>{t("client.noVendorsFound")}</p>}
              </>
            )}
          </div>
        </section>
      )}

      {screen === "vendor" && selectedVendor && (
        <section className="panel">
          <button className="link" onClick={() => setScreen("home")}>
            {t("client.backToHome")}
          </button>
          {selectedVendor.main_image_url && (
            <div className="vendor-hero">
              <img
                src={resolveAssetUrl(selectedVendor.main_image_url)}
                alt={selectedVendor.name}
                onError={(event: SyntheticEvent<HTMLImageElement>) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = buildFallbackImage(selectedVendor.name, 960, 420);
                }}
              />
              {selectedVendor.gallery_images && selectedVendor.gallery_images.length > 0 && (
                <div className="vendor-gallery">
                  {selectedVendor.gallery_images.map((url) => (
                    <img
                      key={url}
                      src={resolveAssetUrl(url)}
                      alt={selectedVendor.name}
                      onError={(event: SyntheticEvent<HTMLImageElement>) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = buildFallbackImage(selectedVendor.name, 240, 160);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="vendor-header">
            <div>
              <h2>{selectedVendor.name}</h2>
              <p className="muted">{selectedVendor.description ?? ""}</p>
              {selectedVendor.phone && <div className="muted">Телефон: {selectedVendor.phone}</div>}
              <div className="muted">{t("client.vendorRating")}: {ratingLabel(selectedVendor)}</div>
              {selectedVendor.is_open_now === false && (
                <div className="error">{t("client.vendorClosed")}</div>
              )}
              {(selectedVendor.is_active === false || selectedVendor.is_blocked) && (
                <div className="error">{t("client.vendorDisabled")}</div>
              )}
            </div>
            <div className="tag-list">
              {selectedVendor.active_promotions?.length ? (
                selectedVendor.active_promotions.map((badge) => (
                  <span key={badge} className="tag">
                    {translateBadge(badge)}
                  </span>
                ))
              ) : (
                <span className="muted">{t("client.noPromotions")}</span>
              )}
            </div>
          </div>
          <div className="card-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="card">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                </div>
              ))
            ) : (
            selectedVendor.menu.filter((item) => item.is_available).map((item) => {
              const expanded = Boolean(expandedItems[item.menu_item_id]);
              return (
                <div key={item.menu_item_id} className="card">
                  {item.image_url ? (
                    <img
                      className="item-image"
                      src={resolveAssetUrl(item.image_url)}
                      alt={item.title}
                      onError={(event: SyntheticEvent<HTMLImageElement>) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = buildFallbackImage(item.title, 420, 280);
                      }}
                    />
                  ) : (
                    <div className="item-image placeholder" />
                  )}
                  <div className="card-title">{item.title}</div>
                  {item.promo_badges?.length ? (
                    <div className="tag-list">
                      {item.promo_badges.map((badge) => (
                        <span key={badge} className="tag">
                          {translateBadge(badge)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="card-meta">{formatWeight(item)}</div>
                  <div className="card-meta">
                    {t("client.price")}: {formatCurrency(item.price)}
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      setExpandedItems((prev) => ({
                        ...prev,
                        [item.menu_item_id]: !expanded,
                      }))
                    }
                  >
                    {expanded ? "Скрыть описание" : "Показать описание"}
                  </button>
                  {expanded && <div className="muted">{item.description ?? ""}</div>}
                  <div className="quantity">
                    <button onClick={() => updateItemQuantity(item.menu_item_id, -1)}>-</button>
                    <span>{cart.items[item.menu_item_id] ?? 0}</span>
                    <button onClick={() => updateItemQuantity(item.menu_item_id, 1)}>+</button>
                  </div>
                </div>
              );
            }))}
          </div>
          {totals.itemsCount > 0 && !isVendorUnavailable(selectedVendor) && (
            <StickyBar itemsCount={totals.itemsCount} subtotal={totals.subtotal} onNext={goToCart} />
          )}
        </section>
      )}

      {screen === "cart" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("client.cartTitle")}</h2>
              <p className="text-sm text-slate-500">{t("client.cartSubtitle")}</p>
            </div>
            <Button variant="secondary" onClick={() => setScreen("vendor")}>
              {t("client.continueShopping")}
            </Button>
          </div>

          {isLoading ? (
            <Card>
              <div className="grid gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </Card>
          ) : cartItems.length === 0 ? (
            <Card>
              <EmptyState
                title={t("client.emptyCartTitle")}
                description={t("client.emptyCartDescription")}
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {cartItems.map(({ item, quantity }) => (
                <Card key={item.menu_item_id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{item.title}</div>
                      {item.description && (
                        <div className="text-sm text-slate-500">{item.description}</div>
                      )}
                      {formatWeight(item) && (
                        <div className="mt-2">
                          <Badge variant="info">{formatWeight(item)}</Badge>
                        </div>
                      )}
                      <div className="mt-2 text-sm text-slate-500">
                        {t("client.price")}: {formatCurrency(item.price)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => updateItemQuantity(item.menu_item_id, -1)}>
                        -
                      </Button>
                      <span className="min-w-[24px] text-center font-semibold text-slate-900">
                        {quantity}
                      </span>
                      <Button variant="secondary" onClick={() => updateItemQuantity(item.menu_item_id, 1)}>
                        +
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <div className="text-sm font-semibold text-slate-900">{t("client.fulfillmentType")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={cart.fulfillmentType === "DELIVERY" ? "primary" : "secondary"}
                onClick={() => setCart((prev) => ({ ...prev, fulfillmentType: "DELIVERY" }))}
              >
                {t("client.delivery")}
              </Button>
              {canPickup && (
                <Button
                  variant={cart.fulfillmentType === "PICKUP" ? "primary" : "secondary"}
                  onClick={() => setCart((prev) => ({ ...prev, fulfillmentType: "PICKUP" }))}
                >
                  {t("client.pickup")}
                </Button>
              )}
            </div>
            {deliveryTooFar && (
              <div className="mt-3 text-sm text-rose-600">
                {t("client.deliveryTooFar")}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-sm font-semibold text-slate-900">{t("client.utensils")}</div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setCart((prev) => ({
                    ...prev,
                    utensilsCount: Math.max(prev.utensilsCount - 1, 0),
                  }))
                }
              >
                -
              </Button>
              <span className="min-w-[24px] text-center font-semibold text-slate-900">
                {cart.utensilsCount}
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  setCart((prev) => ({
                    ...prev,
                    utensilsCount: prev.utensilsCount + 1,
                  }))
                }
              >
                +
              </Button>
            </div>
            <label className="mt-4 block text-sm text-slate-600">
              {t("client.vendorComment")}
              <Textarea
                value={cart.vendorComment}
                onChange={(event) =>
                  setCart((prev) => ({ ...prev, vendorComment: event.target.value }))
                }
                className="mt-2"
              />
            </label>
          </Card>

          <Card>
            <TotalsBlock quote={quote} subtotal={totals.subtotal} />
          </Card>

          {totals.itemsCount > 0 && !isVendorUnavailable(selectedVendor) && (
            <StickyBar itemsCount={totals.itemsCount} subtotal={totals.subtotal} onNext={goToAddress} />
          )}
        </section>
      )}

      {screen === "address" && (
        <section className="panel">
          <button className="link" onClick={() => setScreen("cart")}>
            {t("common.back")}
          </button>
          <div className="tag-list">
            {(["HOME", "WORK", "OTHER"] as AddressType[]).map((type) => (
              <button
                key={type}
                className={address.type === type ? "tag active" : "tag"}
                onClick={() => setAddress((prev) => ({ ...prev, type }))}
              >
                {t(`addressType.${type}`)}
              </button>
            ))}
          </div>

          <div className="field">
            <label>{t("fields.address")}</label>
            <input
              className="input"
              value={address.addressText}
              onChange={(event) => setAddress((prev) => ({ ...prev, addressText: event.target.value }))}
              placeholder={t("client.addressPlaceholder")}
            />
          </div>

          <div className="grid">
            <label>
              {t("client.street")}
              <input
                className="input"
                value={address.street}
                onChange={(event) => setAddress((prev) => ({ ...prev, street: event.target.value }))}
              />
            </label>
            <label>
              {t("client.house")}
              <input
                className="input"
                value={address.house}
                onChange={(event) => setAddress((prev) => ({ ...prev, house: event.target.value }))}
              />
            </label>
            <label>
              {t("client.entrance")}
              <input
                className="input"
                value={address.entrance}
                onChange={(event) => setAddress((prev) => ({ ...prev, entrance: event.target.value }))}
              />
            </label>
            <label>
              {t("client.apartment")}
              <input
                className="input"
                value={address.apartment}
                onChange={(event) => setAddress((prev) => ({ ...prev, apartment: event.target.value }))}
              />
            </label>
          </div>

          <div className="field">
            <label>{t("client.mapPoint")}</label>
            <div className="inline">
              <button className="secondary" onClick={() => setShowMap(true)}>
                {t("client.pickOnMap")}
              </button>
              {address.lat !== null && address.lng !== null && (
                <span className="muted">
                  {address.lat.toFixed(6)}, {address.lng.toFixed(6)}
                </span>
              )}
              {address.lat !== null && address.lng !== null && (
                <span className="muted">Карта работает внутри mini app</span>
              )}
            </div>
            {deliveryTooFar && (
              <div className="error">
                {t("client.tooFarDistance", { km: MAX_CLIENT_DISTANCE_KM })}
              </div>
            )}
          </div>

          {savedAddresses.length > 0 && (
            <div className="list">
              <div className="muted">{t("client.savedAddresses")}</div>
              {savedAddresses.map((entry) => (
                <button
                  key={entry.id}
                  className="card"
                  onClick={() =>
                    setAddress((prev) => ({
                      ...prev,
                      type: entry.type,
                      lat: entry.lat,
                      lng: entry.lng,
                      addressText: entry.address_text,
                      entrance: entry.entrance ?? "",
                      apartment: entry.apartment ?? "",
                    }))
                  }
                >
                  <div className="card-title">{entry.address_text}</div>
                  <div className="muted">
                    {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="inline">
            <button className="secondary" onClick={handleSaveAddress}>
              {t("client.saveAddress")}
            </button>
            <button
              className="primary"
              onClick={goToCheckout}
              disabled={
                isVendorUnavailable(selectedVendor) ||
                cart.fulfillmentType === "DELIVERY" &&
                (address.lat === null || address.lng === null || deliveryTooFar)
              }
            >
              {t("common.continue")}
            </button>
          </div>
        </section>
      )}
      {screen === "checkout" && (
        <section className="space-y-4">
          <Button variant="ghost" onClick={() => setScreen("address")}>
            {t("common.back")}
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("client.checkoutTitle")}</h2>
            <p className="text-sm text-slate-500">{t("client.checkoutSubtitle")}</p>
          </div>

          <Card>
            <label className="text-sm text-slate-600">
              {t("client.deliveryComment")}
              <Textarea
                value={checkout.deliveryComment}
                onChange={(event) =>
                  setCheckout((prev) => ({ ...prev, deliveryComment: event.target.value }))
                }
                placeholder={t("client.deliveryCommentPlaceholder")}
                className="mt-2"
              />
            </label>
          </Card>

          <Card>
            <label className="text-sm text-slate-600">
              {t("client.receiverPhone")}
              <Input
                value={checkout.receiverPhone}
                onChange={(event) =>
                  setCheckout((prev) => ({
                    ...prev,
                    receiverPhone: sanitizeUzPhoneInput(event.target.value),
                  }))
                }
                placeholder="+998XXXXXXXXX"
                className="mt-2"
              />
            </label>
          </Card>

          <Card>
            <div className="text-sm font-semibold text-slate-900">{t("client.promoCodes")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={!cart.promoCode ? "primary" : "secondary"}
                onClick={() => setCart((prev) => ({ ...prev, promoCode: null }))}
              >
                {t("client.noPromo")}
              </Button>
              {promoCodes.map((promo) => (
                <Button
                  key={promo.id}
                  variant={cart.promoCode === promo.code ? "primary" : "secondary"}
                  onClick={() => setCart((prev) => ({ ...prev, promoCode: promo.code }))}
                  disabled={Boolean(promo.status && promo.status !== "ACTIVE")}
                >
                  {promo.code}
                  {promo.status && promo.status !== "ACTIVE" && (
                    <span className="text-xs text-slate-400">({promo.status})</span>
                  )}
                </Button>
              ))}
              {promoCodes.length === 0 && (
                <span className="text-sm text-slate-400">{t("client.noSavedPromo")}</span>
              )}
            </div>
            <div className="mt-4">
              <PromoCodeForm
                value={checkout.manualPromo}
                onChange={(value) => setCheckout((prev) => ({ ...prev, manualPromo: value }))}
                onAdd={async (value) => {
                  setIsLoading(true);
                  setError(null);
                  try {
                    const entry = await addPromoCode(value);
                    setPromoCodes((prev) => [entry, ...prev]);
                    setCheckout((prev) => ({ ...prev, manualPromo: "" }));
                    setCart((prev) => ({ ...prev, promoCode: entry.code }));
                  } catch (err) {
                  setError(err instanceof Error ? err.message : t("errors.addPromo"));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              />
            </div>
          </Card>

          <Card>
            <div className="text-sm font-semibold text-slate-900">{t("client.payment")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={checkout.paymentMethod === "CARD" ? "primary" : "secondary"}
                onClick={() => setCheckout((prev) => ({ ...prev, paymentMethod: "CARD" }))}
              >
                {translatePayment("CARD")}
              </Button>
              <Button
                variant={checkout.paymentMethod === "CASH" ? "primary" : "secondary"}
                onClick={() => setCheckout((prev) => ({ ...prev, paymentMethod: "CASH" }))}
              >
                {translatePayment("CASH")}
              </Button>
            </div>
            {checkout.paymentMethod === "CASH" && (
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checkout.changeRequired}
                    onChange={(event) =>
                      setCheckout((prev) => ({ ...prev, changeRequired: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  {t("client.changeRequired")}
                </label>
                {checkout.changeRequired && (
                  <Input
                    value={checkout.changeForAmount}
                    onChange={(event) =>
                      setCheckout((prev) => ({ ...prev, changeForAmount: event.target.value }))
                    }
                    placeholder={t("client.changeAmount")}
                  />
                )}
              </div>
            )}
          </Card>

          <Card>
            <TotalsBlock quote={quote} subtotal={totals.subtotal} />
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleCreateQuote}>
              {t("client.refreshQuote")}
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={
                isVendorUnavailable(selectedVendor) ||
                cart.fulfillmentType === "DELIVERY" &&
                (address.lat === null || address.lng === null || deliveryTooFar)
              }
            >
              {t("client.sendOrder")}
            </Button>
          </div>
        </section>
      )}

      {screen === "orders" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("client.ordersTitle")}</h2>
              <p className="text-sm text-slate-500">{t("client.ordersSubtitle")}</p>
            </div>
            <Button variant="secondary" onClick={() => void loadOrders()}>
              {t("common.refresh")}
            </Button>
          </div>

          <Card>
            <div className="text-sm font-semibold text-slate-900">{t("vendor.active")}</div>
            {isLoading ? (
              <div className="mt-3 grid gap-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : orders.length === 0 ? (
              <EmptyState
                title={t("empty.noOrders")}
                description={t("client.noActiveOrders")}
              />
            ) : (
              <div className="mt-3 grid gap-3">
                {orders.map((entry) => (
                  <Card key={entry.order_id} className="bg-slate-50">
                    <button
                      className="w-full text-left"
                      onClick={() => void openOrderDetails(entry.order_id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold text-slate-900">
                          {entry.vendor_name}
                        </div>
                        <StatusBadge status={entry.status} />
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        {t("common.total")}: {formatCurrency(entry.total)} · {translateFulfillment(entry.fulfillment_type)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {entry.order_number ?? entry.order_id}
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatDateTime(entry.created_at)}
                      </div>
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-sm font-semibold text-slate-900">{t("vendor.history")}</div>
            {isLoading ? (
              <div className="mt-3 grid gap-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : ordersHistory.length === 0 ? (
              <EmptyState
                title={t("client.noHistoryOrders")}
                description={t("client.historyOrdersHint")}
              />
            ) : (
              <div className="mt-3 grid gap-3">
                {ordersHistory.map((entry) => (
                  <Card key={entry.order_id} className="bg-slate-50">
                    <button
                      className="w-full text-left"
                      onClick={() => void openOrderDetails(entry.order_id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold text-slate-900">
                          {entry.vendor_name}
                        </div>
                        <StatusBadge status={entry.status} />
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        {t("common.total")}: {formatCurrency(entry.total)} · {translateFulfillment(entry.fulfillment_type)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {entry.order_number ?? entry.order_id}
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatDateTime(entry.created_at)}
                      </div>
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {screen === "orderDetails" && (
        <section className="space-y-4">
          <Button variant="ghost" onClick={goToOrders}>
            {t("client.backToOrders")}
          </Button>
          {isLoading && !order ? (
            <Card>
              <div className="grid gap-2">
                <Skeleton className="h-6" />
                <Skeleton className="h-16" />
              </div>
            </Card>
          ) : order ? (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      {order.vendor_name ?? order.vendor_id}
                    </div>
                    <div className="text-sm text-slate-500">
                      {order.order_number ?? order.order_id}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={order.status} />
                      <Badge variant="info">
                    {translateFulfillment(order.fulfillment_type)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {t("client.delivery")}: {t("client.deliveredByVendor")}
                    </div>
                    {order.vendor_phone && (
                      <div className="text-sm text-slate-500">Телефон ресторана: {order.vendor_phone}</div>
                    )}
                    {order.vendor_rating_avg !== null &&
                    order.vendor_rating_avg !== undefined && (
                      <div className="text-sm text-slate-500">
                        {t("fields.rating")}{" "}
                        {`${order.vendor_rating_avg.toFixed(1)} (${formatNumber(order.vendor_rating_count ?? 0)})`}
                      </div>
                    )}
                    {order.delivers_self && order.fulfillment_type === "DELIVERY" && (
                      <div className="text-sm text-slate-500">
                        {t("client.deliveredByVendor")}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => order.order_id && void refreshOrder(order.order_id)}
                  >
                    {t("common.refresh")}
                  </Button>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <div><strong>{t("client.deliveryComment")}:</strong> {order.delivery_comment ?? "-"}</div>
                  <div><strong>{t("client.vendorComment")}:</strong> {order.vendor_comment ?? "-"}</div>
                  <div><strong>{t("client.receiverPhone")}:</strong> {order.receiver_phone ?? "-"}</div>
                  <div>
                    <strong>{t("client.payment")}:</strong> {order.payment_method ? translatePayment(order.payment_method) : "-"}{" "}
                    {order.change_for_amount ? `(change ${order.change_for_amount})` : ""}
                  </div>
                  <div><strong>{t("client.address")}:</strong> {order.address_text ?? "-"}</div>
                  <div>
                    <strong>{t("client.entranceApt")}:</strong> {order.address_entrance ?? "-"} /{" "}
                    {order.address_apartment ?? "-"}
                  </div>
                </div>
              </Card>

              {order.fulfillment_type === "DELIVERY" && deliveryCode && (
                <Card>
                  <div className="text-sm font-semibold text-slate-900">{t("client.deliveryCode")}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{deliveryCode}</div>
                </Card>
              )}
              {order.fulfillment_type === "PICKUP" && pickupCode && (
                <Card>
                  <div className="text-sm font-semibold text-slate-900">{t("client.pickupCode")}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{pickupCode}</div>
                </Card>
              )}

              <Card>
                <div className="text-sm font-semibold text-slate-900">{t("client.totals")}</div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <span>{t("client.itemsSubtotal")}</span>
                    <span>{formatCurrency(order.items_subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("client.discounts")}</span>
                    <span>-{formatCurrency(order.discount_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("client.promoDiscount")}</span>
                    <span>-{formatCurrency(order.promo_code_discount)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>{t("common.total")}</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-900">{t("client.items")}</div>
                <div className="mt-3 grid gap-2">
                  {order.items.map((item) => (
                    <div key={item.menu_item_id} className="flex justify-between text-sm text-slate-600">
                      <div>
                        <div className="font-medium text-slate-900">
                          {item.title ?? item.menu_item_id}
                        </div>
                        {item.weight_value && item.weight_unit && (
                          <div className="text-xs text-slate-400">
                            {item.weight_value} {item.weight_unit}
                          </div>
                        )}
                        <div className="text-xs text-slate-400">{t("client.qty")}: {item.quantity}</div>
                      </div>
                      <div className="text-sm text-slate-500">{formatCurrency(item.price)}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-900">{t("client.statusTimeline")}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    "NEW",
                    "ACCEPTED",
                    "COOKING",
                    "READY",
                    "DELIVERED",
                    "COMPLETED",
                    "CANCELLED_BY_VENDOR",
                  ].map((step) => (
                    <Badge key={step} variant={order.status === step ? "info" : "default"}>
                      {step}
                    </Badge>
                  ))}
                </div>
              </Card>

              {order.status === "COMPLETED" || order.status === "DELIVERED" ? (
                <Card>
                  <div className="text-sm font-semibold text-slate-900">{t("client.rateOrder")}</div>
                  {order.rating ? (
                    <div className="mt-2 text-sm text-slate-500">{t("client.thanksForRating")}</div>
                  ) : (
                    <div className="mt-3 grid gap-4">
                      <label className="text-sm text-slate-600">
                        {t("client.vendorStars")}
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={ratingDraft.vendorStars}
                          onChange={(event) =>
                            setRatingDraft((prev) => ({
                              ...prev,
                              vendorStars: Number(event.target.value),
                            }))
                          }
                          className="mt-1"
                        />
                        <Textarea
                          placeholder={t("client.vendorCommentPlaceholder")}
                          value={ratingDraft.vendorComment}
                          onChange={(event) =>
                            setRatingDraft((prev) => ({
                              ...prev,
                              vendorComment: event.target.value,
                            }))
                          }
                          className="mt-2"
                        />
                      </label>
                      <Button
                        onClick={async () => {
                          if (!order.order_id) return;
                          setIsLoading(true);
                          setError(null);
                          try {
                            await submitOrderRating(order.order_id, {
                              vendor_stars: ratingDraft.vendorStars,
                              vendor_comment: ratingDraft.vendorComment,
                              courier_stars: null,
                              courier_comment: null,
                            });
                            await refreshOrder(order.order_id);
                          } catch (err) {
                            setError(
                              err instanceof Error ? err.message : t("errors.submitRating"),
                            );
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                      >
                        {t("client.submitRating")}
                      </Button>
                    </div>
                  )}
                </Card>
              ) : null}
            </div>
          ) : (
            <Card>
              <EmptyState
                title={t("client.noOrderSelected")}
                description={t("client.noOrderSelectedDesc")}
              />
            </Card>
          )}
        </section>
      )}

      {screen === "profile" && (
        <section className="panel">
          <div className="tag-list">
            {(["account", "addresses", "promo"] as ProfileTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  className={profileTab === tab ? "tag active" : "tag"}
                  onClick={() => setProfileTab(tab)}
                >
                  {t(`profileTab.${tab}`)}
                </button>
              ),
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <span>{t("client.language")}</span>
            <select
              className="input"
              value={getLanguage()}
              onChange={(event) => setLanguage(event.target.value as "ru" | "uz" | "kaa" | "en")}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {profileTab === "account" && (
            <div className="list">
              <div className="card">
                <div className="card-title">{t("nav.account")}</div>
                <div className="field">
                  <label>{t("fields.fullName")}</label>
                  <input
                    className="input"
                    value={profile?.full_name ?? ""}
                    onChange={(event) =>
                      setProfile((prev) =>
                        prev
                          ? { ...prev, full_name: event.target.value }
                          : {
                              client_id: "local",
                              full_name: event.target.value,
                              phone: null,
                              telegram_username: null,
                              about: null,
                            },
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>{t("fields.phone")}</label>
                  <input
                    className="input"
                    value={profile?.phone ?? ""}
                    onChange={(event) =>
                      setProfile((prev) =>
                        prev
                          ? { ...prev, phone: event.target.value }
                          : {
                              client_id: "local",
                              full_name: null,
                              phone: event.target.value,
                              telegram_username: null,
                              about: null,
                            },
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>{t("fields.telegramUsername")}</label>
                  <input
                    className="input"
                    value={profile?.telegram_username ?? ""}
                    onChange={(event) =>
                      setProfile((prev) =>
                        prev
                          ? { ...prev, telegram_username: event.target.value }
                          : {
                              client_id: "local",
                              full_name: null,
                              phone: null,
                              telegram_username: event.target.value,
                              about: null,
                            },
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label>{t("fields.about")}</label>
                  <textarea
                    className="input"
                    value={profile?.about ?? ""}
                    onChange={(event) =>
                      setProfile((prev) =>
                        prev
                          ? { ...prev, about: event.target.value }
                          : {
                              client_id: "local",
                              full_name: null,
                              phone: null,
                              telegram_username: null,
                              about: event.target.value,
                            },
                      )
                    }
                  />
                </div>
                <button
                  className="primary"
                  onClick={async () => {
                    if (!profile) return;
                    setIsLoading(true);
                    setError(null);
                    try {
                      const updated = await updateProfile({
                        full_name: profile.full_name,
                        phone: profile.phone,
                        telegram_username: profile.telegram_username,
                        about: profile.about,
                      });
                      setProfile(updated);
                      toast.success("Сохранено");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t("errors.updateProfile"));
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          )}

          {profileTab === "addresses" && (
            <div className="list">
              <button className="secondary" onClick={() => void loadAddresses()}>
                {t("client.refreshAddresses")}
              </button>
              <div className="card">
                <div className="card-title">{t("client.addAddress")}</div>
                <div className="field">
                  <label>{t("fields.type")}</label>
                  <div className="inline">
                    {(["HOME", "WORK", "OTHER"] as AddressType[]).map((type) => (
                      <button
                        key={type}
                        className={addressForm.type === type ? "tag active" : "tag"}
                        onClick={() => setAddressForm((prev) => ({ ...prev, type }))}
                      >
                        {t(`addressType.${type}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>{t("fields.address")}</label>
                  <input
                    className="input"
                    value={addressForm.address_text}
                    onChange={(event) =>
                      setAddressForm((prev) => ({ ...prev, address_text: event.target.value }))
                    }
                  />
                </div>
                <div className="grid">
                  <label>
                    {t("client.entrance")}
                    <input
                      className="input"
                      value={addressForm.entrance}
                      onChange={(event) =>
                        setAddressForm((prev) => ({ ...prev, entrance: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    {t("client.apartment")}
                    <input
                      className="input"
                      value={addressForm.apartment}
                      onChange={(event) =>
                        setAddressForm((prev) => ({ ...prev, apartment: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <button
                  className="primary"
                  onClick={async () => {
                    const lat = address.lat;
                    const lng = address.lng;
                    if (!addressForm.address_text.trim() || lat === null || lng === null) {
                      setError(t("errors.addressLatLng"));
                      return;
                    }
                    setIsLoading(true);
                    setError(null);
                    try {
                      await addAddress({
                        type: addressForm.type,
                        address_text: addressForm.address_text.trim(),
                        lat,
                        lng,
                        entrance: addressForm.entrance.trim() || null,
                        apartment: addressForm.apartment.trim() || null,
                      });
                      setAddressForm({
                        type: "HOME",
                        address_text: "",
                        entrance: "",
                        apartment: "",
                      });
                      await loadAddresses();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t("errors.addAddress"));
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  {t("client.saveAddress")}
                </button>
                <div className="muted">
                  Координаты берутся из выбранной точки на карте:{" "}
                  {address.lat !== null && address.lng !== null
                    ? `${address.lat.toFixed(5)}, ${address.lng.toFixed(5)}`
                    : "точка не выбрана"}
                </div>
              </div>
              {savedAddresses.length === 0 ? (
                <div className="muted">{t("client.noSavedAddresses")}</div>
              ) : (
                savedAddresses.map((entry) => (
                  <div key={entry.id} className="row">
                    <div>
                      <div>{entry.type}</div>
                      <div className="muted">{entry.address_text}</div>
                    </div>
                    <button
                      className="secondary"
                      onClick={async () => {
                        setIsLoading(true);
                        setError(null);
                        try {
                          await removeAddress(entry.id);
                          await loadAddresses();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("errors.removeAddress"));
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {profileTab === "promo" && (
            <div className="list">
              <div className="row">
                <div>{t("client.savedPromoCodes")}</div>
                <button className="secondary" onClick={() => void listPromoCodes().then(setPromoCodes)}>
                  {t("common.refresh")}
                </button>
              </div>
              {promoCodes.map((promo) => (
                <div key={promo.id} className="row">
                  <div>
                    <div>{promo.code}</div>
                    <div className="muted">{promo.status ?? "-"}</div>
                  </div>
                  <button
                    className="secondary"
                    onClick={async () => {
                      setIsLoading(true);
                      setError(null);
                      try {
                        await removePromoCode(promo.id);
                        setPromoCodes((prev) => prev.filter((entry) => entry.id !== promo.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("errors.removePromo"));
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <PromoCodeForm
                value={checkout.manualPromo}
                onChange={(value) => setCheckout((prev) => ({ ...prev, manualPromo: value }))} 
                onAdd={async (value) => {
                  setIsLoading(true);
                  setError(null);
                  try {
                    const entry = await addPromoCode(value);
                    setPromoCodes((prev) => [entry, ...prev]);
                    setCheckout((prev) => ({ ...prev, manualPromo: "" }));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("errors.addPromo"));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              />
            </div>
          )}

        </section>
      )}

      {showMap && (
        <div className="modal">
          <div className="modal-content">
            <div className="row">
              <div className="card-title">{t("client.selectLocation")}</div>
              <div className="inline">
                <button
                  className="secondary"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      setError(t("errors.geolocationUnavailable"));
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        void applyPickedLocation(position.coords.latitude, position.coords.longitude);
                      },
                      () => setError(t("errors.geolocationFailed")),
                    );
                  }}
                >
                  {t("client.useMyLocation")}
                </button>
                <button className="secondary" onClick={() => setShowMap(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
            <div className="card">
              <div className="muted">Карта внутри Telegram Mini App</div>
              <MapContainer
                key={`${mapDraftLat}:${mapDraftLng}`}
                center={{
                  lat: Number.isFinite(Number(mapDraftLat))
                    ? Number(mapDraftLat)
                    : DEFAULT_CENTER_QONIRAT.lat,
                  lng: Number.isFinite(Number(mapDraftLng))
                    ? Number(mapDraftLng)
                    : DEFAULT_CENTER_QONIRAT.lng,
                }}
                zoom={MAP_ZOOM}
                className="map map-inline"
                scrollWheelZoom={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapPickLayer
                  position={
                    Number.isFinite(Number(mapDraftLat)) && Number.isFinite(Number(mapDraftLng))
                      ? { lat: Number(mapDraftLat), lng: Number(mapDraftLng) }
                      : null
                  }
                  onPick={(lat, lng) => {
                    setMapDraftLat(lat.toFixed(6));
                    setMapDraftLng(lng.toFixed(6));
                  }}
                />
              </MapContainer>
              <div className="grid mt-2">
                <label>
                  {t("fields.latitude")}
                  <input
                    className="input"
                    value={mapDraftLat}
                    onChange={(event) => setMapDraftLat(event.target.value)}
                  />
                </label>
                <label>
                  {t("fields.longitude")}
                  <input
                    className="input"
                    value={mapDraftLng}
                    onChange={(event) => setMapDraftLng(event.target.value)}
                  />
                </label>
              </div>
              <div className="inline mt-2">
                <button
                  className="primary"
                  onClick={() => {
                    const lat = Number(mapDraftLat);
                    const lng = Number(mapDraftLng);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                      setError(t("errors.addressLatLng"));
                      return;
                    }
                    void applyPickedLocation(lat, lng);
                  }}
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MapPickLayer({
  position,
  onPick,
}: {
  position: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });

  if (!position) {
    return null;
  }
  return <Marker position={position} />;
}

function StickyBar({
  itemsCount,
  subtotal,
  onNext,
}: {
  itemsCount: number;
  subtotal: number;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky-bar">
      <div>
        {itemsCount} · {formatCurrency(subtotal)}
      </div>
      <Button variant="secondary" onClick={onNext}>
        {t("common.continue")}
      </Button>
    </div>
  );
}

function TotalsBlock({ quote, subtotal }: { quote: QuoteResponse | null; subtotal: number }) {
  const { t } = useTranslation();
  if (!quote) {
    return (
      <div className="totals">
        <div className="row">
          <div>{t("client.itemsSubtotal")}</div>
          <div>{formatCurrency(subtotal)}</div>
        </div>
        <div className="row">
          <div>{t("client.discounts")}</div>
          <div>-{formatCurrency(0)}</div>
        </div>
        <div className="row">
          <div>{t("client.promoDiscount")}</div>
          <div>-{formatCurrency(0)}</div>
        </div>
        <div className="row">
          <div>{t("common.total")}</div>
          <div>—</div>
        </div>
      </div>
    );
  }
  return (
    <div className="totals">
      <div className="row">
        <div>{t("client.itemsSubtotal")}</div>
        <div>{formatCurrency(quote.items_subtotal)}</div>
      </div>
      <div className="row">
        <div>{t("client.discounts")}</div>
        <div>-{formatCurrency(quote.discount_total)}</div>
      </div>
      <div className="row">
        <div>{t("client.promoDiscount")}</div>
        <div>-{formatCurrency(quote.promo_code_discount)}</div>
      </div>
      <div className="row">
        <div>{t("common.total")}</div>
        <div>{formatCurrency(quote.total)}</div>
      </div>
    </div>
  );
}

function PromoCodeForm({
  value,
  onChange,
  onAdd,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder={t("client.addPromoPlaceholder")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex-1"
      />
      <Button variant="secondary" onClick={() => value.trim() && onAdd(value.trim())}>
        {t("common.add")}
      </Button>
    </div>
  );
}

async function reverseGeocodeAddress(lat: number, lng: number): Promise<{
  addressText: string | null;
  street: string | null;
  house: string | null;
}> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("accept-language", "ru");

    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return { addressText: null, street: null, house: null };
    }
    const data = (await response.json()) as {
      display_name?: string;
      address?: {
        road?: string;
        pedestrian?: string;
        house_number?: string;
      };
    };
    const street = data.address?.road || data.address?.pedestrian || null;
    const house = data.address?.house_number || null;
    return {
      addressText: data.display_name || null,
      street,
      house,
    };
  } catch {
    return { addressText: null, street: null, house: null };
  }
}

function buildFallbackImage(label: string, width: number, height: number) {
  const safeLabel = (label || "Nodex").replace(/[<>&"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#dbeafe'/><stop offset='100%' stop-color='#e2e8f0'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#334155' font-family='Segoe UI, sans-serif' font-size='24'>${safeLabel}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatWeight(item: MenuItem) {
  if (!item.weight_value || !item.weight_unit) {
    return "";
  }
  return `${item.weight_value} ${item.weight_unit}`;
}

function sanitizeUzPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "");
  let normalized = digits.startsWith("998") ? digits : `998${digits.replace(/^0+/, "")}`;
  if (normalized.length < 3) {
    normalized = "998";
  }
  return `+${normalized.slice(0, 12)}`;
}

function normalizeUzPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits.startsWith("998")) {
    return null;
  }
  if (digits.length !== 12) {
    return null;
  }
  return `+${digits}`;
}
