# Commerce & Course Data-Flow Audit

Scope: Vite + React + Firebase Auth + Firestore + Firebase Admin (Vercel `/api`) + Razorpay.
The audit covers **purchase flows, course content, paid updates, EduCoin, subscriptions,
and the entitlement records that unlock Course Player access**. The Checkout, PDP, Course
Player and Subscription UIs are **not** being redesigned in Part 1 — only the schemas
that flow through them.

This document is the input to Part 2 (canonicalization), but in Part 1 we are **not**
removing or rewriting any working code. The goal of Part 1 is to:

1. Inventory every product/module/resource/purchase shape that exists today.
2. Identify fields that survive the round-trip and fields that are silently lost.
3. Ship a **shared `src/types/commerce.ts`** so every flow can be brought onto a single
   vocabulary without a behaviour change.
4. Ship **pure unit tests** for the price/selection math that Part 2 will rely on.

---

## 1. Existing product schemas

There is **no single product schema**. The repository currently has **four overlapping
representations** of the same catalog item, plus a fifth (admin) that is the source of
truth in Firestore.

### 1.1 Firestore document (`siteProducts/{productId}`) — the source of truth

Written by `src/lib/admin/client.ts` → `saveProduct()` (lines 110-130). Read by
`src/context/CatalogContext.tsx` → `mapProduct()` (lines 25-50).

Fields that are **actually persisted** in Firestore on the catalog doc:

| Field                | Source                                      | Survives normalize? |
|----------------------|---------------------------------------------|---------------------|
| `adminProduct`       | full editor form (raw JSON)                 | kept verbatim, not read by client |
| `id`                 | `ref.id`                                    | yes |
| `title`              | editor `title`                              | yes |
| `description`        | editor `shortDescription`                   | yes |
| `longDescription`    | editor `longDescription`                    | **lost** — client reads `description` only |
| `instructor`         | editor `instructor` (string)                | yes (becomes `Product.instructor`) |
| `category`           | editor `category`                           | yes (mapped to enum) |
| `subject`            | editor `subject`                            | yes |
| `sku`                | editor `sku`                                | **lost** |
| `tags`               | editor `tags`                               | yes (uppercased) |
| `keywords`           | editor `searchKeywords`                     | **lost** (not in `Product`) |
| `features`           | editor `features`                           | **lost** |
| `images`             | editor `images[].url` (flattened)           | partially (`productImages.card` and `images[0]` are read; full list is dropped) |
| `productImages.card` | `images.find(isPrimary).url`                | yes |
| `price`              | `₹${regularPrice || 0}` (string)            | yes (parsed numeric) |
| `salePrice`          | `₹${salePrice}` or `null`                   | yes (parsed numeric) |
| `coinPrice`          | editor `coinPrice` (number)                 | **lost** — `Product` has no coin price |
| `isFree`             | editor `isFree`                             | **lost** — only derived from price |
| `isVisible`          | editor `visibility === "visible"`           | yes (filters in snapshot) |
| `inStock`            | editor `availableForSale`                   | **lost** — never read by client |
| `manualRating`       | editor `manualRating`                       | yes (used as rating fallback) |
| `rating`             | (legacy field, not written by saveProduct)  | yes if present |
| `reviewCount`        | (legacy field, not written)                 | yes (read) |
| `dimensions`         | editor `estimatedDuration`                   | partially — becomes `classLevel` |
| `level`              | (legacy)                                    | yes if present, otherwise "Lifetime access" |
| `paymentLink`        | (legacy)                                    | yes (passed to UI but unused) |
| `courseContent`      | editor `modules` → flattened tree           | yes (after `sanitizeUrlOnlyCourseContent`) |
| `paidUpdates`        | editor `paidUpdates`                        | **lost** — `Product` has no paid-updates field |

### 1.2 Editor form (`src/components/admin/products/ProductEditor.tsx`)

This is the **richest** product schema. It is the contract that `ProductEditor.tsx`
ships to `/api/admin/products` and that `adminFetch` round-trips through Firestore.
Fields and their destiny after round-trip:

| Editor field            | Stored where                                 | After Firestore → client normalization |
|-------------------------|----------------------------------------------|----------------------------------------|
| `id`                    | doc id                                       | `Product.id` |
| `title`                 | `title`                                      | `Product.title` |
| `shortDescription`      | `description`                                | `Product.description` |
| `longDescription`       | `longDescription`                            | **lost** |
| `instructor`            | `instructor` (string)                        | `Product.instructor` (also drops nested `instructor.name` form) |
| `category`              | `category`                                   | `Product.category` (mapped to enum) |
| `productType`           | `adminProduct.productType` only              | **lost** |
| `classLevel`            | `dimensions`                                 | `Product.classLevel` (mixed with `level` legacy) |
| `subject`               | `subject`                                    | `Product.subject` |
| `sku`                   | `sku`                                        | **lost** |
| `tags[]`                | `tags`                                       | `Product.tags` (uppercased) |
| `searchKeywords[]`      | `keywords`                                   | **lost** |
| `features[]`            | `features`                                   | **lost** |
| `estimatedDuration`     | `dimensions`                                 | collides with `classLevel` |
| `language`              | `adminProduct.language` only                 | **lost** |
| `manualRating`          | `manualRating`                               | `Product.rating` (number) |
| `visibility`            | `isVisible`                                  | filter only |
| `availableForSale`      | `inStock`                                    | **lost** |
| `images[]`              | `images[]` (urls) + `productImages.card`     | **mostly lost** — only `productImages.card` reaches the client |
| `regularPrice`          | `price` (string)                             | `Product.originalPrice` |
| `salePrice`             | `salePrice` (string)                         | `Product.price` |
| `coinPrice`             | `coinPrice` (number)                         | **lost** |
| `coinPurchaseEnabled`   | not persisted                                | **lost** |
| `isFree`                | `isFree`                                     | **lost** (not in `Product`) |
| `eligibleCouponIds[]`   | not persisted                                | **lost** |
| `minPayableAmount`      | not persisted                                | **lost** |
| `availabilityDate`      | not persisted                                | **lost** |
| `saleStart` / `saleEnd` | not persisted                                | **lost** |
| `modules[]`             | `courseContent` (rooted tree, nested)        | yes — but **heavily transformed** (see §2) |
| `paidUpdates[]`         | `paidUpdates`                                | **lost** — client never sees them |
| `status`                | not persisted                                | **lost** |

### 1.3 Client `Product` (`src/data/products.ts`)

```ts
type Product = {
  id, title, instructor, image, category, classLevel, subject,
  tags, rating, reviews, originalPrice, price, description?,
  paymentLink?, courseContent?
};
```

This is what the rest of the React app sees. Every field that exists **only** on the
editor form is invisible here.

### 1.4 Checkout data (`src/data/checkoutData.ts`)

A **demo-only** static product injected via `applyCheckoutContext()`. Real prices and
ownership never reach this object — it is overwritten by `main.tsx` before the
`CheckoutApp` mounts.

```ts
interface Product { id, productIds?, updateSelection?, name, type, description, price, currency, thumbnail, instructor, duration, rating, totalRatings }
```

This shape is *also* unrelated to anything in Firestore; it is replaced wholesale in
`sessionStorage` between routes.

### 1.5 Subscription data (`src/subscription/data/*`)

Hard-coded fixtures. `Course[]`, `Feature[]` and `ShowcaseCard[]` are static and never
round-trip through Firestore. The subscription page is currently a **simulation**:
`handleSubscribe()` waits 1.4s and shows a success overlay. No order, no entitlement,
no user doc is written.

---

## 2. Existing module / resource schemas

Module and resource shapes also drift between editor, persist path, sanitiser, and
player. Three different vocabularies co-exist (`paidUpdate` vs `paid_update`,
`included` vs `purchasable` vs `paid_update` vs `hidden`).

### 2.1 Admin editor module (`src/lib/admin/types.ts` → `ProductModule`)

```ts
{
  id, title, description, sortOrder,
  visibility: "visible" | "hidden",
  active: boolean,
  accessLevel: "included" | "purchasable" | "paid_update" | "hidden",
  individuallyPurchasable: boolean,
  cashPrice: number | null, salePrice: number | null, coinPrice: number | null,
  includeInBundle: boolean, previewAvailable: boolean,
  requiredPreviousModuleIds: string[],
  entitlementId: string,
  badge: string | null,
  parentModuleId: string | null,
  resources: ProductResource[]
}
```

### 2.2 Admin editor resource (`ProductResource`)

```ts
{
  id, name,
  type: "youtube" | "video_url" | "audio_url" | "image_url" | "gdrive" |
        "pdf" | "gdoc" | "gsheet" | "gform" | "ebook" |
        "github_pages" | "whimsical" | "iframe",
  url, provider, sortOrder,
  visibility: "visible" | "hidden",
  accessLevel: "included" | "purchasable" | "paid_update" | "hidden",
  paidUpdateId: string | null,
  cashPrice: number | null, coinPrice: number | null
}
```

### 2.3 Client module (`src/types/course.ts` → `CourseModule`)

Drift happens in `src/lib/admin/client.ts` → `moduleToCourse()` and
`resourceToCourse()`:

| Editor field        | After `moduleToCourse`/normalize             | After `sanitizeUrlOnlyCourseContent` |
|---------------------|----------------------------------------------|--------------------------------------|
| `accessLevel`       | `paid_update → paidUpdate`, `hidden → hidden`, else `included` | same mapping |
| `entitlementId`     | stored as `paidUpdateId` on the module       | preserved |
| `cashPrice`         | string `₹${...}` on `paidUpdatePrice`        | preserved |
| `coinPrice`         | number on `paidUpdateCoinPrice`              | preserved |
| `salePrice`         | `salePrice` (number)                         | **lost** — sanitiser drops salePrice |
| `individuallyPurchasable` | kept                                  | preserved |
| `includeInBundle`   | kept                                         | preserved |
| `previewAvailable`  | kept                                         | preserved |
| `requiredPreviousModuleIds` | kept                                 | preserved |
| `parentModuleId`    | used to nest children, then dropped          | lost as a property, kept as a tree |
| `badge`             | **lost**                                     | lost |
| `active`            | **lost**                                     | lost |
| `description`       | kept on module                               | preserved (not used by player) |

For **resources** the drift is more aggressive. `resourceToCourse()` aliases the
`type` field (e.g. `video_url → video`, `gdoc → doc`, `whimsical → mindmap`),
introduces legacy string types, and writes `paidUpdatePrice` as a `₹${...}` string
even though everything else uses numbers.

### 2.4 Resource on `CourseFile` (`src/types/course.ts`)

```ts
type CourseFile = CourseAccessMeta & {
  id, name, type: CourseFileType, url?, embedUrl?, youtubeUrl?, youtubeVideoId?,
  size?, contentType?, provider?
}
type CourseAccessMeta = {
  accessLevel?: "included" | "paidUpdate" | "hidden",
  paidUpdateId?, paidUpdateTitle?, paidUpdatePrice?, paidUpdateCoinPrice?
}
```

Notice the second vocabulary shift: editor + persist path use `paid_update` (snake)
and `purchasable`; player + sanitiser use `paidUpdate` (camel) and a closed set of
**only three** access levels (`included | paidUpdate | hidden`). This means
`purchasable` and `included` become the same thing in the player, and resources
that the editor marked `purchasable` silently fall through to the same code path as
`included`.

---

## 3. Fields saved by Admin

The admin **saves** more than the **player reads**. Saving is done by
`saveProduct()` in `src/lib/admin/client.ts`:

```ts
await setDoc(ref, {
  adminProduct: body,        // full editor form
  id, title, description, longDescription, instructor, category, subject, sku,
  tags, keywords, features,
  images, productImages: { card },
  price: `₹${regularPrice}`, salePrice, coinPrice, isFree,
  isVisible, inStock, manualRating, dimensions,
  courseContent, paidUpdates,
  updatedAt
}, { merge: true });
```

So Admin **persists**: `adminProduct`, `id`, `title`, `description`,
`longDescription`, `instructor` (string), `category`, `subject`, `sku`, `tags`,
`keywords`, `features`, `images[]`, `productImages.card`, `price` (string with ₹),
`salePrice` (string or null), `coinPrice`, `isFree`, `isVisible`, `inStock`,
`manualRating`, `dimensions`, `courseContent`, `paidUpdates`, `updatedAt`.

Of those, the **client catalog** (`CatalogContext.mapProduct`) reads only:
`id`, `title`, `instructor`, `productImages.card`, `images[0]`, `image`, `category`,
`classLevel` (`dimensions | level | "Lifetime access"`), `subject`, `tags`,
`rating` (`manualRating ?? rating ?? calculatedRating`), `reviews` (`reviewCount |
ratingCount`), `price`, `salePrice`, `description`, `paymentLink`, `courseContent`,
`isVisible` (filter).

Everything else is silently lost on the read path.

---

## 4. Fields lost during Firestore / Catalog normalization

The following fields are **written** to Firestore by the admin but **disappear** when
the client reads them back through `CatalogContext.mapProduct`:

- `adminProduct` (the entire editor form JSON, including `productType`, `language`,
  `minPayableAmount`, `eligibleCouponIds`, `saleStart`, `saleEnd`,
  `availabilityDate`, `coinPurchaseEnabled`, `features`).
- `longDescription`
- `sku`
- `keywords`
- `features`
- `images[]` (full list, not just the primary)
- `coinPrice`
- `isFree`
- `inStock`
- `paidUpdates` (the full paid-update catalogue is never read by the client; the
  client instead reverse-engineers them from `accessLevel === "paidUpdate"` on
  modules and files — see `CoursePlayerApp.collectUpdates`).
- `dimensions` vs `classLevel` collision (both editor `classLevel` and editor
  `estimatedDuration` end up in the same Firestore field).
- Module-level `badge`, `active` flag, sale price.
- Resource-level `paidUpdateId` is read by the player but `entitlementId` on the
  module is **not** read by the player; the player uses the resource's own
  `paidUpdateId` (or its own `id` if absent).
- Editor `purchasable` is silently coerced to player `included` — the player
  cannot tell the difference.
- Resources with `type === "link"` are silently renamed to `embed`
  (`sanitizeUrlOnlyCourseContent`), and resources with non-URL types are dropped
  entirely. The editor UI still has the legacy `link` option conceptually, but
  the player has no such concept.

---

## 5. Existing checkout context

`CheckoutApp` reads from a single mutable module-level `product` and `user` exported
by `src/data/checkoutData.ts`:

```ts
export const product: Product;   // demo data
export const user: UserProfile;  // demo data
```

These are **replaced at runtime** by `applyCheckoutContext()` in `src/main.tsx`,
which mutates the same module-level objects before `<CheckoutApp />` mounts. The
context is also serialised to `sessionStorage["checkoutContext"]`.

Three call-sites in `main.tsx` build a `CheckoutContext`:

1. `navigateToCheckout()` — single product from PDP / course route.
2. `handleCartCheckout()` — multi-product cart bundle (`id = bundle-${ts}`).
3. `handlePurchaseUpdate()` — paid course update with `updateSelection`.

After construction, `main.tsx` calls `applyCheckoutContext(...)` and stores the
serialised context in `sessionStorage`. On `#/checkout`, the context is read back,
re-applied, and `<CheckoutApp />` renders.

The Order Summary step (`src/components/OrderSummary.tsx`) only reads
`product.price`, `product.currency`, `product.thumbnail`, `product.name`,
`product.description`, `product.instructor`, `product.duration`, `product.rating`,
`product.totalRatings`, `product.type`, and `user.{name,email,phone,avatarEmoji}`.

**EduCoin redemption is hard-coded to `discount = 0`** with the comment
`"EduCoin redemption remains disabled until its balance can be deducted atomically
on the server."` No `eduCoinUsed` ever reaches the server, and the field in
`UserProfile` (`eduCoins`, `maxEduCoinsUsable`) is **purely display data** in the
checkout flow — `main.tsx` copies `user.coins` from the auth profile into
`UserProfile.eduCoins`, but the value is never sent to the API and never debited.

---

## 6. Existing Razorpay request shape

### 6.1 `POST /api/razorpay/create-order`

Client body (`src/components/PaymentGateway.tsx` → `apiRequest("create-order", …)`):

```ts
{
  productId?: string,
  productIds?: string[],
  updateSelection?: { productId: string; updateId: string }
}
```

Server (`api/razorpay/create-order.ts`):

- If `updateSelection` is present → handles a **course update** path:
  reads `siteProducts/{productId}`, checks `users/{uid}/purchases/{productId}` exists
  (the base course must be owned), checks
  `users/{uid}.purchasedProductUpdateIds[productId]` for already-owned updates, and
  computes `amountPaise` from the `paidUpdatePrice` of the matched module/file.
- Else → handles a **product bundle** path:
  reads each `siteProducts/{id}`, filters out products the user already owns
  (`users/{uid}/purchases/{productId}.exists`), sums `parseProductPricePaise` over
  what remains, and creates a Razorpay order.
- If the final amount is 0, the server **grants entitlements immediately** and
  returns `{ free: true, verified: true, orderId: "FREE-..." }`. The client
  surfaces this as `paymentMethod: "Free access"`.

The server writes `_paymentIntents/{orderId}` with:

```ts
{
  uid, checkoutType: "products" | "course_update",
  productId? (for course_update), updateId? (for course_update),
  productIds[]? (for products), requestedProductIds[]?,
  amountPaise, currency: "INR", status: "created", receipt, createdAt
}
```

The client request **does not** carry: `purchaseKind`, `moduleIds`, `resourceIds`,
`updateIds`, `subscriptionPlanId`, `featureIds`, `couponCode`, `requestedEduCoins`,
or `returnRoute`. None of those concepts exist in the API yet.

### 6.2 `POST /api/razorpay/verify-payment`

Client body:

```ts
{
  razorpay_order_id, razorpay_payment_id, razorpay_signature
}
```

Server (`api/razorpay/verify-payment.ts`):

- Re-creates the HMAC-SHA256 signature with `RAZORPAY_KEY_SECRET` and compares with
  `crypto.timingSafeEqual`.
- Reads `_paymentIntents/{orderId}` and rejects mismatched `uid`.
- Fetches `GET /v1/payments/{paymentId}` from Razorpay, captures the payment if
  status is `authorized`, then asserts `payment.status === "captured"`, matching
  `order_id` and `amount`.
- Branches on `intent.checkoutType` and calls
  `grantCourseUpdate(...)` or `grantProductEntitlements(...)`.

### 6.3 Entitlements written by the server

`grantProductEntitlements()` (`api/_lib/firebaseAdmin.ts`):

For each purchased product, writes `users/{uid}/purchases/{productId}`:

```ts
{
  productId, productDocumentId, title, quantity: 1,
  total: "₹<amount>", amountPaise, currency: "INR",
  status: "Verified", source: "razorpay" | "free",
  orderId, paymentId, unlockedAt
}
```

Also updates `users/{uid}`:

```ts
{ purchasedProductIds: arrayUnion(...),
  cartProductIds: arrayRemove(...),
  updatedAt }
```

And writes `siteOrders/{orderId}` with the full receipt (items, totals, status).

`grantCourseUpdate()` (`api/_lib/courseUpdates.ts`) is parallel but writes the
entitlement at `users/{uid}/purchases/{productId}__update__{updateId}` and updates
`users/{uid}.purchasedProductUpdateIds[productId] = arrayUnion(updateId)`. The
order doc gets `checkoutType: "course_update"`, `productId`, `updateId` and a
single-item `items` array.

---

## 7. Existing entitlement records

There are **four different entitlement shapes** in the same data store today, and
the `Product.purchasedIds` set the client uses to gate the Course Player only sees
**one** of them.

| Path                                                          | Written by | Read by client? |
|---------------------------------------------------------------|------------|-----------------|
| `users/{uid}/purchases/{productId}`                           | `grantProductEntitlements` | yes — `CatalogContext` reads `productDocumentId` into `purchasedIds` |
| `users/{uid}/purchases/{productId}__update__{updateId}`       | `grantCourseUpdate` | **no** — the player reads `purchasedProductUpdateIds[productId]` array instead |
| `users/{uid}.purchasedProductIds[]`                           | `grantProductEntitlements` | **no** — written but never read by the client today |
| `users/{uid}.purchasedProductUpdateIds[productId][]`          | `grantCourseUpdate` | yes — `CoursePlayerApp` reads this to decide if a paid-update module is unlocked |

Consequences:

- A user who paid for an update but never bought the base course cannot play the
  update because the API requires `users/{uid}/purchases/{productId}` to exist
  first (`create-order.ts` line 22). But the **Course Player** gate is the
  `purchasedIds` Set, which is only populated by
  `users/{uid}/purchases/{productId}.productDocumentId`. The base course has to be
  purchased **and** the update needs to be purchased separately; both purchases
  produce records, but they are not symmetric.
- The player does **not** see module-level or resource-level entitlements (i.e.
  someone who paid for one module inside a bundle has no record on the client).

---

## 8. Existing Course Player access logic

`src/CoursePlayerApp.tsx`:

- `firstAccessibleFile(modules, ownedUpdateIds)` walks the module tree and returns
  the first file that is:
  - not `accessLevel === "hidden"`
  - has a URL
  - not inside a `paidUpdate` module unless the update is owned
  - not a `paidUpdate` file unless the update is owned
- `collectUpdates(modules)` walks the tree and groups any
  `accessLevel === "paidUpdate"` module/file into a `PaidCourseUpdate` whose price
  is the **maximum** of the per-item `paidUpdatePrice` values. It pulls content
  names from the items, not from any catalogued `paidUpdates` array.
- The user clicks "Buy this update" → `onBuyUpdate(update)` → calls
  `handlePurchaseUpdate` in `main.tsx`, which builds a `CheckoutContext` with
  `updateSelection = { productId, updateId, title, price }`.
- The Course Player reads:
  - `users/{uid}/courseProgress/{productId}` for `completedFileIds` and `notes`.
  - `users/{uid}.purchasedProductUpdateIds[productId]` for owned updates.
- It writes `completedFileIds`, `lastOpenedFileId`, `notes`, all with `merge: true`,
  and is constrained by the `courseProgress` rules block (cannot write protected
  fields like `purchasedProductIds`).

There is no concept of "I bought this individual module" — the player can only
tell if the **base product** is owned (via `purchasedIds` from the catalog
context) and if specific **paid updates** are owned (via
`purchasedProductUpdateIds[productId]`).

---

## 9. Existing Subscription simulation

`src/subscription/App.tsx` is a one-page simulation. The only side-effect is:

```ts
const handleSubscribe = () => {
  if (!user) { window.location.hash = "#/auth?mode=login&return=..."; return; }
  setIsSubscribing(true);
  window.setTimeout(() => {
    setIsSubscribing(false);
    setShowSuccess(true);
  }, 1400);
};
```

- No `users/{uid}.subscriptionTier` write.
- No order written to `siteOrders`.
- No Razorpay call.
- The `user.subscriptionTier` shown on the Profile page is whatever
  `users/{uid}.subscriptionTier` already is, set by the Auth bootstrap.
- The plan data (`COURSES`, `FEATURES`, `BASE_MONTHLY`, `BASE_YEARLY`,
  `COUPONS`, `REFERRALS`) is hard-coded in `src/subscription/data/*`. None of it
  is sourced from Firestore.
- The Subscription page already *has* the UI fields we will need:
  - `BillingCycle` ("monthly" | "yearly")
  - `selectedCourseIds[]`, `selectedFeatureIds[]`
  - `couponApplied`, `referralApplied`
  - `subtotal`, `couponDiscount`, `referralDiscount`, `total`
  - `minPayable` floor (`Math.max(afterCoupon - referralDiscount, 0.5)`)

That UI vocabulary is the basis for the `CheckoutSelection` and `ServerPriceQuote`
shapes in `src/types/commerce.ts`.

---

## 10. Existing EduCoin-disabled logic

`src/components/OrderSummary.tsx` lines 9-13:

```ts
// EduCoin redemption remains disabled until its balance can be deducted atomically on the server.
const discount = 0;
const finalPrice = product.price;
```

The whole `eduCoin`-related UI block was removed and only a comment placeholder
remains. The `UserProfile` type still carries `eduCoins` and `maxEduCoinsUsable`,
and `main.tsx` does `eduCoins: user.coins` when building the context, but the
value is never read by any server endpoint, never deducted, and never validated.

Firestore already has the wallets:

- `users/{uid}.coinBalance` and `users/{uid}.eduCoins` (admin writes both).
- `users/{uid}/coinTransactions/{id}` for the history shown on Profile.
- `wallets/{userId}` (rules allow the user to read/write their own wallet).
- `coinTransactions/{id}` (top-level collection, user-owned).
- `productUnlocks`, `youtubeWatchRewards`, `watchProgress`, `pdfDownloadRewards`
  (related earning/reward collections).

None of these are read or written by the current checkout flow.

---

## 11. Duplicate / incompatible schemas (consolidated)

The same concepts are spelled five different ways today:

| Concept           | Admin form | Persist path | Catalog client | Player client | API server |
|-------------------|------------|--------------|----------------|---------------|------------|
| Module access     | `purchasable` | `included` (after coerce) | n/a | `included` | `paidUpdate` |
| Update access     | `paid_update` | `paidUpdate` | n/a | `paidUpdate` | `paidUpdate` |
| Hidden            | `hidden`   | `hidden`     | n/a | `hidden`    | `hidden` |
| Module ID source  | `entitlementId` | `paidUpdateId` | n/a | `paidUpdateId || id` | `paidUpdateId \|\| id` |
| Module cash price | `cashPrice: number` | `₹${cashPrice}` (string) | n/a | parsed via `numericPrice()` | parsed via `parseProductPricePaise` |
| Module sale price | `salePrice: number` | dropped | n/a | not used | not used |
| Product price     | `regularPrice` + `salePrice` | `price` (₹string) + `salePrice` (₹string) | `originalPrice` + `price` (numbers) | n/a | parsed via `parseProductPricePaise` |
| Product coin price | `coinPrice` (number) | `coinPrice` (number) | n/a | n/a | n/a |
| Paid update ID    | `paidUpdates[].id` | `paidUpdates[]` (full list) | not read | reverse-engineered from module/file | matched against module/file `paidUpdateId` |
| Resource type     | `video_url`/`audio_url`/... (13 enums) | `video`/`audio`/... (aliased) | n/a | `youtube`/`video`/`audio`/... (11 enums) | n/a |

The `Product` used in the React app, the `Product` in the static checkout fixtures,
the `adminProduct` JSON, the Firestore `courseContent` tree, and the `ProductModule`
the player constructs are **all different types** with overlapping fields.

---

## 12. Deprecated code that should eventually be removed

This list is **informational only for Part 1** — none of it is being removed in
Part 1 because it is still wired into the running app.

- `src/data/checkoutData.ts` — the static demo `product` and `user`. Real flow
  uses `applyCheckoutContext()` from `main.tsx` and `sessionStorage`. The demo
  shapes are still imported by `CheckoutApp`, `OrderSummary`, and
  `VerificationSuccess`.
- `src/components/OrderSummary.tsx` — `discount = 0; finalPrice = product.price;`
  is dead code waiting for server-side wallet support. The receipt references
  `eduCoinsUsed` but it is always 0.
- `src/components/VerificationSuccess.tsx` — `handleDownloadReceipt()` is a
  `window.alert(...)` placeholder. `sessionStorage.setItem("selectedCourse", ...)`
  is duplicated work — `main.tsx` already does this through `navigateToCourse`.
- The `paidCourseUpdate` flow uses the legacy checkout (`productIds` shape, no
  `updateSelection.pricePaise` enforcement on the client) instead of going
  through the admin `PaidUpdate` catalogue.
- `src/lib/admin/client.ts` `paidUpdates: body.paidUpdates || []` is **written**
  to Firestore but **never read** by the client. `findPaidUpdate()` in
  `api/_lib/courseUpdates.ts` therefore walks `courseContent` to find a matching
  `paidUpdateId` — a reverse-engineering step that should be replaced by reading
  the catalogue directly.
- `users/{uid}.purchasedProductIds` is written but never read on the client; the
  client reads `users/{uid}/purchases` subcollection instead.
- `productImages` / `images[]` in Firestore are written as a denormalised pair;
  only the primary is read.

---

## 13. What Part 2 will fix (out of scope here)

The canonical schema and tests in `src/types/commerce.ts` and
`tests/commerce.test.mjs` are **additive** and do **not** modify any existing
behaviour. Part 2 will:

1. Funnel `create-order` and `verify-payment` through the
   `PurchaseKind` + `CheckoutLineItem` + `ServerPriceQuote` types.
2. Replace `findPaidUpdate` with a direct read of the
   `CanonicalPaidUpdate` catalogue on the product doc.
3. Make `EduCoin` redemption a real `eduCoinDiscount` field on the server quote.
4. Make subscription checkout a real `subscription` / `subscription_features`
   `PurchaseKind` against the existing `_paymentIntents` collection.
5. Stop the silent `purchasable → included` collapse by making
   `accessLevel` consistent at the type level.
6. Persist a single `Entitlement` shape (per module, per resource, per update, per
   product) so the Course Player can gate at every level, not just product +
   paid-update.
7. Add a server-side `ServerPriceQuote` cache keyed by `quoteId` to prevent
   client-supplied prices from leaking through.

---

## Appendix A — File-level changes made in Part 1

- `docs/commerce-course-audit.md` (new) — this document.
- `src/types/commerce.ts` (new) — the canonical type module.
- `tests/commerce.test.mjs` (new) — pure unit tests for the canonical helpers.

No other files are modified. No production code is touched, no behaviour is
changed, and no Firestore rules are updated.
