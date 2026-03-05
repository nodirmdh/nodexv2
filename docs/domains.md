# Domains

## Glossary
- **Vendorka**: Vendor cabinet (Telegram Mini App) for a single physical vendor point.
- **Vendor**: Single physical point (no outlets) with `name`, `address_text`, geo (lat/lng), optional `phone`, `inn`, `opening_hours`, `payout_details`, and `is_active`.
- **Promotion**: Discount rule (item-level or order-level) that does not stack on the same item units.
- **Promo code**: Admin-managed discount code saved by client in profile.

## Entities and relationships (narrative ERD)
- **Vendor** has one **VendorUser** (or more) for Vendorka access.
- **Vendor** has many **MenuItems** and **Promotions**.
- **Client** has many **SavedPromoCodes** and **Orders**.
- **Order** belongs to one **Vendor** and one **Client**.
- **Order** has many **OrderItems** and one **Quote** (pricing breakdown).
- **PromoCode** is global and referenced by **Order** (optional).
- **Quote**
  - `items_subtotal`
  - `service_fee` (always 3000)
  - `delivery_fee` (0 for PICKUP; min 3000 for DELIVERY)
  - `discount_total`
  - `total`

## Order state machine (with ownership)

### Vendor track
| State | Owner | Notes |
| --- | --- | --- |
| NEW | Vendor | Order arrives to Vendorka. |
| ACCEPTED | Vendor | Vendor accepts order. |
| COOKING | Vendor | Preparation in progress. |
| READY | Vendor | Ready for vendor delivery or customer pickup. |

### Delivery track
| State | Owner | Notes |
| --- | --- | --- |
| DELIVERED | Vendor | Vendor enters client delivery code. |
| COMPLETED | System | Finalized (optional). |

### Pickup orders
| State | Owner | Notes |
| --- | --- | --- |
| HANDOFF_CONFIRMED | Vendor | Vendor confirms pickup code. |
| COMPLETED | System | Finalized (pickup). |

### Cancellation
| State | Owner | Notes |
| --- | --- | --- |
| CANCELLED | Admin | Admin can cancel anytime. |
| CANCELLED_BY_VENDOR | Vendor | Only before acceptance (ASSUMPTION). |

## Promotions data model (breakdown)
- **Promotion**
  - `type` (FIXED_PRICE, PERCENT, COMBO, BUY_X_GET_Y, GIFT)
  - `starts_at`, `ends_at`, `is_active`
  - `vendor_id`
- **PromotionItem**
  - Links promotion to specific menu items or categories.
  - For FIXED_PRICE/PERCENT/BUY_X_GET_Y.
- **Combo**
  - Defined set of items and combo price/discount.
- **Gift**
  - Gift item and minimum order amount threshold.


