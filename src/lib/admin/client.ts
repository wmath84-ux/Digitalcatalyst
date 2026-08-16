import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { APPROVED_ADMIN_EMAIL, clearAdminSession, hasAdminSession } from "@/utils/adminSession";
import {
  editorToFirestoreBody,
  firestoreModulesToEditorFlat,
  firestoreToEditorForm,
  isProductPublished,
  stripUndefinedDeep,
} from "../../../utils/productMapping";
import { fullDemoCourseContent } from "../../data/demoCourseContent";
import type { PaidUpdate, ProductModule } from "./types";

export class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
const bodyOf = (init?: RequestInit) => init?.body ? JSON.parse(String(init.body)) as Record<string, any> : {};
const urlOf = (input: string) => new URL(input, window.location.origin);
const asDate = (value: any) => value?.toDate?.()?.toISOString?.() || String(value || new Date().toISOString());
const money = (value: any) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
/** Coerce any editor value to a string so `undefined` never reaches Firestore. */
const str = (value: any, fallback = "") => (value === null || value === undefined ? fallback : String(value));
/** Coerce a list field to a clean string array (drops undefined/null/blank entries). */
const strList = (value: any): string[] => (Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined).map((item) => String(item)) : []);
const id = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

async function ensureAdmin() {
  const user = auth.currentUser;
  if (!user || !hasAdminSession(user.uid, user.email || "", "admin")) throw new ApiError("Admin session expired.", 401);
  const snap = await getDoc(doc(db, "users", user.uid));
  if (user.email?.toLowerCase() !== APPROVED_ADMIN_EMAIL || snap.data()?.role !== "admin") { clearAdminSession(); throw new ApiError("Admin access revoked.", 401); }
  return user;
}

// Fire-and-forget: ask the server to instantly announce this product change —
// a create pushes to every subscribed device, an update pushes to the
// product's buyers when the course tree actually grew. Never blocks or
// breaks the admin save flow.
async function notifyProductChange(productId: string, action: "product-created" | "product-updated") {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken(true);
    const response = await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, productId }),
      // Let delivery finish if the admin navigates away immediately after save.
      keepalive: true,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || `Push endpoint returned ${response.status}`);
    }
  } catch (error) {
    console.warn("[admin] product push announcement skipped", error);
  }
}

function productForEditor(raw: any, documentId: string) {
  // Canonical round-trip: the mapping layer reconstructs the full editor
  // form (modules, paid updates, images, pricing) from the Firestore doc.
  // For docs written by the editor (which carry the `adminProduct` blob)
  // the mapping prefers the blob because it is the editor's own submission.
  const form = firestoreToEditorForm(raw, documentId);
  if (form && (!Array.isArray(form.modules) || form.modules.length === 0)) {
    // Mirror the catalog: when a product has no course content configured,
    // the Course Player shows the built-in starter course. Populate the editor
    // with that same starter content so the admin sees (and can customize) the
    // exact modules/files learners actually see in the player.
    form.modules = firestoreModulesToEditorFlat(fullDemoCourseContent) as ProductModule[];
    if (!Array.isArray(form.paidUpdates) || form.paidUpdates.length === 0) {
      form.paidUpdates = demoPaidUpdatesFromContent(fullDemoCourseContent);
    }
  }
  return form;
}

/**
 * Build the editor `paidUpdates` list from the starter course’s paid-update
 * modules (grouped by their `paidUpdateId`), so the "Paid updates" tab shows
 * the same premium content the player renders.
 */
function demoPaidUpdatesFromContent(content: Array<{ id: string; accessLevel?: string; paidUpdateId?: string; paidUpdateTitle?: string; paidUpdatePrice?: string; paidUpdateCoinPrice?: number }>): PaidUpdate[] {
  const map = new Map<string, PaidUpdate>();
  for (const module of content) {
    if (module.accessLevel !== "paidUpdate") continue;
    const id = module.paidUpdateId || module.id;
    let update = map.get(id);
    if (!update) {
      update = {
        id,
        title: module.paidUpdateTitle || "Course update",
        description: "",
        includedIds: [],
        cashPrice: Number(String(module.paidUpdatePrice || "0").replace(/[^0-9.-]/g, "")) || 0,
        coinPrice: Number(module.paidUpdateCoinPrice || 0),
        active: true,
        publishDate: null,
        visibility: "visible",
        sortOrder: map.size,
      };
      map.set(id, update);
    }
    if (!update.includedIds.includes(module.id)) update.includedIds.push(module.id);
  }
  return Array.from(map.values());
}

async function productsRequest(url: URL, init?: RequestInit) {
  const method = init?.method || "GET"; const path = url.pathname; const match = path.match(/\/products\/([^/]+)$/);
  if (match) {
    const ref = doc(db, "siteProducts", decodeURIComponent(match[1]));
    if (method === "GET") { const snap = await getDoc(ref); if (!snap.exists()) throw new ApiError("Product not found",404); return { product: productForEditor(snap.data(), snap.id) }; }
    if (method === "DELETE") { await deleteDoc(ref); return { ok: true }; }
    if (method === "PATCH") { const body = bodyOf(init); const product = await saveProduct(ref, body); void notifyProductChange(ref.id, "product-updated"); return { product }; }
  }
  if (method === "POST") { const body = bodyOf(init); const ref = doc(db, "siteProducts", String(body.id || id())); const product = await saveProduct(ref, body); void notifyProductChange(ref.id, "product-created"); return { product }; }
  const snap = await getDocs(collection(db, "siteProducts"));
  let products = snap.docs.map((item) => { const p = productForEditor(item.data(), item.id); return { ...(p || {}), reviewCount: Number(item.data().reviewCount || 0), rating: String(item.data().rating || item.data().manualRating || 0), updatedAt: asDate(item.data().updatedAt), modules: (p && p.modules) || [], images: (p && p.images) || [] }; });
  const q=(url.searchParams.get("q")||"").toLowerCase(); if(q) products=products.filter((p:any)=>`${p.id} ${p.title} ${p.category}`.toLowerCase().includes(q));
  const visibility=url.searchParams.get("visibility"); if(visibility) products=products.filter((p:any)=>p.visibility===visibility);
  const availability=url.searchParams.get("availability"); if(availability) products=products.filter((p:any)=>p.availableForSale===(availability==="available"));
  const pricing=url.searchParams.get("pricing"); if(pricing) products=products.filter((p:any)=>Boolean(p.isFree)===(pricing==="free"));
  return { products };
}
async function saveProduct(ref: ReturnType<typeof doc>, body: any) {
  // Publication status is authoritative. The previous implementation wrote
  // `status: published` into adminProduct but copied the stale hidden toggle to
  // `isVisible`, so Create & publish created a document the catalog filtered
  // out. Keep all representations atomic and impossible to contradict.
  const requestedStatus = ["draft", "published", "archived"].includes(String(body.status))
    ? String(body.status) as "draft" | "published" | "archived"
    : body.visibility === "visible" ? "published" : "draft";
  const visibility = requestedStatus === "published" ? "visible" : "hidden";
  const normalizedBody = stripUndefinedDeep({
    ...body,
    id: ref.id,
    status: requestedStatus,
    visibility,
    availableForSale: Boolean(body.availableForSale),
  });

  // One mapper owns both the lossless admin form and the player-ready tree.
  // It normalises iframe/share URLs, keeps draft-only invalid resources in the
  // editor, and excludes them from learner content until fixed.
  const mapped = editorToFirestoreBody(normalizedBody);
  if (!mapped) throw new ApiError("Product data is invalid.", 400);
  const courseContent = mapped.courseContent;
  const paidUpdates = mapped.paidUpdates;

  // Images may be missing entirely on a partial payload — never index into it
  // blindly, and never let a blank/undefined url reach the document.
  const imageEntries = (Array.isArray(body.images) ? [...body.images] : [])
    .filter((image: any) => image && typeof image.url === "string" && image.url.trim())
    .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const urls = imageEntries.map((image: any) => String(image.url).trim());
  const primaryUrl = String(imageEntries.find((image: any) => image.isPrimary)?.url || urls[0] || "").trim();

  // Firestore refuses ANY `undefined` field value and fails the entire write.
  // Every top-level field consumed by Store, Home, PDP, search, checkout and
  // admin reload is written from the same normalised form in one setDoc.
  const payload = stripUndefinedDeep({
    adminProduct: mapped.adminProduct,
    id: ref.id,
    title: str(normalizedBody.title, "Untitled product"),
    description: str(normalizedBody.shortDescription),
    longDescription: str(normalizedBody.longDescription),
    instructor: str(normalizedBody.instructor, "Digital Catalyst"),
    category: str(normalizedBody.category),
    productType: str(normalizedBody.productType, "course"),
    subject: str(normalizedBody.subject),
    sku: str(normalizedBody.sku),
    language: str(normalizedBody.language, "English"),
    dimensions: str(normalizedBody.classLevel || normalizedBody.estimatedDuration),
    tags: strList(normalizedBody.tags),
    keywords: strList(normalizedBody.searchKeywords),
    features: strList(normalizedBody.features),
    images: urls,
    productImages: { card: primaryUrl },
    price: Boolean(normalizedBody.isFree) ? "₹0" : `₹${str(normalizedBody.regularPrice, "0") || "0"}`,
    salePrice: Boolean(normalizedBody.isFree) ? null : (normalizedBody.salePrice !== null && normalizedBody.salePrice !== "" ? `₹${str(normalizedBody.salePrice)}` : null),
    coinPrice: Number(normalizedBody.coinPrice || 0),
    isFree: Boolean(normalizedBody.isFree),
    manualRating: normalizedBody.manualRating === null || normalizedBody.manualRating === "" ? null : Number(normalizedBody.manualRating),
    status: requestedStatus,
    isVisible: requestedStatus === "published",
    inStock: Boolean(normalizedBody.availableForSale),
    courseContent,
    paidUpdates,
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload, { merge: true });
  return { ...normalizedBody, ...mapped.adminProduct, id: ref.id, status: requestedStatus, visibility };
}

async function genericCollection(name: string, key: string, init?: RequestInit) {
  const method=init?.method||"GET"; const body=bodyOf(init); const col=collection(db,name);
  if(method==="GET"){const snap=await getDocs(col);return {[key]:snap.docs.map(d=>({id:d.id,...d.data()}))};}
  const recordId=String(body.id||id()); const ref=doc(db,name,recordId);
  if(body.delete){await deleteDoc(ref);return {ok:true};}
  await setDoc(ref,stripUndefinedDeep({...body,id:recordId,updatedAt:serverTimestamp()}),{merge:true}); return {[key.replace(/s$/,"")]:{...body,id:recordId}};
}

async function subscriptionPlansRequest(init?: RequestInit) {
  const method = init?.method || "GET";
  if (method === "GET") {
    const snap = await getDocs(collection(db, "subscriptionPlans"));
    return { plans: snap.docs.map((item) => {
      const data = item.data() || {};
      return { id: item.id, name: data.name || "Plan", description: data.description || "", billingCycles: [
        { cycle: "monthly", label: "Monthly", price: money(data.monthlyPrice ?? data.priceMonthly ?? 0) },
        { cycle: "yearly", label: "Yearly", price: money(data.yearlyPrice ?? data.priceYearly ?? 0) },
      ], accessTier: data.accessTier || item.id, badge: data.badge || null, cta: data.cta || "Subscribe", featured: Boolean(data.featured), active: data.active !== false };
    }) };
  }
  const body = bodyOf(init); const recordId = String(body.id || id()); const ref = doc(db, "subscriptionPlans", recordId);
  if (body.delete) { await deleteDoc(ref); return { ok: true }; }
  const cycles = Array.isArray(body.billingCycles) ? body.billingCycles : [];
  const monthly = cycles.find((cycle: any) => cycle.cycle === "monthly")?.price ?? 0;
  const yearly = cycles.find((cycle: any) => cycle.cycle === "yearly")?.price ?? 0;
  await setDoc(ref, stripUndefinedDeep({ id: recordId, name: str(body.name, "Plan"), description: str(body.description), monthlyPrice: Number(monthly), yearlyPrice: Number(yearly), allowedCycles: ["monthly", "yearly"], accessTier: body.accessTier || "basic", badge: body.badge || null, cta: body.cta || "Subscribe", featured: Boolean(body.featured), active: body.active !== false, includedFeatureIds: [], updatedAt: serverTimestamp() }), { merge: true });
  return { plan: { ...body, id: recordId } };
}

async function subscriptionFeaturesRequest(init?: RequestInit) {
  const method = init?.method || "GET";
  if (method === "GET") {
    const snap = await getDocs(collection(db, "subscriptionFeatures"));
    return { features: snap.docs.map((item) => { const data = item.data() || {}; return { id: item.id, key: data.key || item.id, name: data.name || "Feature", description: data.description || "", individualPrice: String(money(data.price ?? data.individualPrice ?? 0)), monthlyPrice: data.monthlyPrice === undefined || data.monthlyPrice === null ? "" : String(money(data.monthlyPrice)), yearlyPrice: data.yearlyPrice === undefined || data.yearlyPrice === null ? "" : String(money(data.yearlyPrice)), planPricing: data.planPricing && typeof data.planPricing === "object" ? data.planPricing : {}, icon: data.icon || "sparkles", included: data.included === true, badge: data.badge || "", sortOrder: Number(data.sortOrder || 0), active: data.active !== false }; }) };
  }
  const body = bodyOf(init); const recordId = String(body.id || body.key || id()); const ref = doc(db, "subscriptionFeatures", recordId);
  if (body.delete) { await deleteDoc(ref); return { ok: true }; }
  const optionalRupees = (value: unknown) => (value === "" || value === null || value === undefined ? null : Number(value));
  await setDoc(ref, stripUndefinedDeep({ id: recordId, key: str(body.key, recordId), name: str(body.name, "Feature"), description: str(body.description), price: Number(body.individualPrice || 0), monthlyPrice: optionalRupees(body.monthlyPrice), yearlyPrice: optionalRupees(body.yearlyPrice), planPricing: body.planPricing && typeof body.planPricing === "object" ? body.planPricing : {}, icon: str(body.icon, recordId === "my-day" ? "calendar" : "sparkles"), included: body.included === true, badge: str(body.badge), sortOrder: Math.floor(Number(body.sortOrder || 0)), active: body.active !== false, updatedAt: serverTimestamp() }), { merge: true });
  return { feature: { ...body, id: recordId } };
}

async function subscriptionPlanProductsRequest(init?: RequestInit) {
  const method = init?.method || "GET";
  if (method === "GET") {
    const [pricingSnap, productsSnap] = await Promise.all([
      getDocs(collection(db, "subscriptionPlanProducts")),
      getDocs(collection(db, "siteProducts")),
    ]);
    const pricing = new Map<string, any>(pricingSnap.docs.map((item) => {
      const data = item.data() || {};
      return [String(data.productId || item.id), { id: item.id, ...data }];
    }));
    // Every existing store product is shown, even before an override has been
    // created. This lets Admin customise the whole current catalog instead of
    // manually copying product IDs one by one.
    const rows = productsSnap.docs.map((item) => {
      const product = item.data() || {};
      const productId = String(product.id || item.id);
      const data: any = pricing.get(productId) || pricing.get(item.id) || {};
      pricing.delete(productId);
      pricing.delete(item.id);
      return {
        id: data.id || productId,
        productId,
        name: data.name || product.title || "Product",
        description: data.description || product.description || "",
        individualPrice: String(money(data.price ?? data.individualPrice ?? product.salePrice ?? product.price ?? 0)),
        monthlyPrice: data.monthlyPrice === undefined || data.monthlyPrice === null ? "" : String(money(data.monthlyPrice)),
        yearlyPrice: data.yearlyPrice === undefined || data.yearlyPrice === null ? "" : String(money(data.yearlyPrice)),
        planPricing: data.planPricing && typeof data.planPricing === "object" ? data.planPricing : {},
        included: data.included === true,
        active: data.active !== false && product.isVisible !== false && product.inStock !== false,
        sortOrder: Number(data.sortOrder || 0),
      };
    });
    // Keep legacy overrides whose product document is temporarily unavailable,
    // so Admin can still edit or deactivate them.
    for (const data of pricing.values()) {
      rows.push({
        id: data.id,
        productId: data.productId || data.id,
        name: data.name || "Product",
        description: data.description || "",
        individualPrice: String(money(data.price ?? data.individualPrice ?? 0)),
        monthlyPrice: data.monthlyPrice === undefined || data.monthlyPrice === null ? "" : String(money(data.monthlyPrice)),
        yearlyPrice: data.yearlyPrice === undefined || data.yearlyPrice === null ? "" : String(money(data.yearlyPrice)),
        planPricing: data.planPricing && typeof data.planPricing === "object" ? data.planPricing : {},
        included: data.included === true,
        active: data.active !== false,
        sortOrder: Number(data.sortOrder || 0),
      });
    }
    return { products: rows };
  }
  const body = bodyOf(init);
  const recordId = String(body.id || body.productId || id());
  const ref = doc(db, "subscriptionPlanProducts", recordId);
  if (body.delete) { await deleteDoc(ref); return { ok: true }; }
  const optionalRupees = (value: unknown) => (value === "" || value === null || value === undefined ? null : Number(value));
  await setDoc(ref, stripUndefinedDeep({
    id: recordId,
    productId: str(body.productId || recordId),
    name: str(body.name, "Product"),
    price: Number(body.individualPrice || 0),
    monthlyPrice: optionalRupees(body.monthlyPrice),
    yearlyPrice: optionalRupees(body.yearlyPrice),
    planPricing: body.planPricing && typeof body.planPricing === "object" ? body.planPricing : {},
    included: body.included === true,
    active: body.active !== false,
    sortOrder: Math.floor(Number(body.sortOrder || 0)),
    updatedAt: serverTimestamp(),
  }), { merge: true });
  return { product: { ...body, id: recordId } };
}

async function customersRequest(url: URL, init?: RequestInit) {
  const parts=url.pathname.split("/").filter(Boolean); const uid=parts[3];
  if(uid){const ref=doc(db,"users",uid); const snap=await getDoc(ref); if(!snap.exists())throw new ApiError("Customer not found",404); let data=snap.data();
    if(init?.method==="PATCH"){const b=bodyOf(init);await updateDoc(ref,{status:b.status,blocked:b.status==="blocked",updatedAt:serverTimestamp()});data={...data,status:b.status};}
    const orders=(await getDocs(collection(db,"siteOrders"))).docs.map(d=>({id:d.id,...d.data()})).filter((o:any)=>o.customerUid===uid).map(mapOrder);
    return {customer:mapCustomer(uid,data),orders,reviews:[]};}
  let rows=(await getDocs(collection(db,"users"))).docs.map(d=>mapCustomer(d.id,d.data())); const q=(url.searchParams.get("q")||"").toLowerCase();if(q)rows=rows.filter((r:any)=>`${r.uid} ${r.name} ${r.email}`.toLowerCase().includes(q));const s=url.searchParams.get("status");if(s)rows=rows.filter((r:any)=>r.status===s);const p=url.searchParams.get("provider");if(p && p !== null)rows=rows.filter((r:any)=>r.provider===p);return {customers:rows};
}
const mapCustomer=(uid:string,d:any)=>({uid,name:d.name||null,email:d.email||"",mobile:d.mobile||null,provider:d.authProvider||"password",role:d.role||"user",status:d.status||"active",subscriptionId:d.subscriptionPlanId||null,purchaseCount:Array.isArray(d.purchasedProductIds)?d.purchasedProductIds.length:0,wishlist:d.wishlistProductIds||[],cart:d.cartProductIds||[],joinedAt:asDate(d.createdAt),lastLoginAt:asDate(d.lastLoginAt||d.updatedAt||d.createdAt)});
const mapOrder=(d:any)=>({id:String(d.id||""),customerId:d.customerUid||"",customerName:d.customerName||null,customerEmail:d.customerEmail||null,purchaseKind:d.checkoutType||d.purchaseKind||"product",items:(d.items||[]).map((i:any,index:number)=>({id:String(i.id||index),kind:i.kind||"product",refId:String(i.id||""),title:i.name||i.title||"Item",price:money(i.price)})),couponCode:d.couponCode||null,discountAmount:String(d.discountAmount||0),cashPaid:String(d.amountPaise?d.amountPaise/100:money(d.total)),finalAmount:String(d.amountPaise?d.amountPaise/100:money(d.total)),paymentStatus:String(d.paymentStatus||d.status||"verified").toLowerCase(),entitlementStatus:d.entitlementStatus||"access_granted",gatewayOrderId:d.gatewayOrderId||d.id||null,gatewayPaymentId:d.paymentId||null,grantedEntitlementIds:d.grantedEntitlementIds||[],failureReason:d.failureReason||null,createdAt:asDate(d.createdAt||d.date),verifiedAt:asDate(d.verifiedAt||d.createdAt||d.date)});

async function ordersRequest(url:URL){const match=url.pathname.match(/\/orders\/([^/]+)$/);const snap=await getDocs(collection(db,"siteOrders"));const rows=snap.docs.map(d=>mapOrder({id:d.id,...d.data()}));if(match){const order=rows.find(o=>o.id===decodeURIComponent(match[1]));if(!order)throw new ApiError("Order not found",404);return {order};}let result=rows;const q=(url.searchParams.get("q")||"").toLowerCase();if(q)result=result.filter(o=>`${o.id} ${o.customerName} ${o.customerEmail}`.toLowerCase().includes(q));const status=url.searchParams.get("status");if(status)result=result.filter(o=>o.paymentStatus===status);const kind=url.searchParams.get("kind");if(kind)result=result.filter(o=>o.purchaseKind===kind);return {orders:result};}

const SETTINGS_DEFAULTS:Record<string,any>={adminContent:{siteName:"Digital Catalyst",banners:[],categories:[],testimonials:[],storeTitle:"Store",storeSubtitle:"",showWishlist:true,showRatings:true,showSaleBadges:true,emptyStateMessages:{},pdpHelperTexts:{},coursePlayerMessages:{},authLabels:{openDashboardLabel:"Open dashboard"},docsEditorAccess:"toolbar",docsEditorAccessByType:{},drivePersonalCopy:{clientId:"",byType:{}}},referralProgram:{enabled:true,discountPaise:25000,maxUsesPerReferrer:null}};
async function settingsRequest(documentId:string,key:string,init?:RequestInit){const ref=doc(db,"settings",documentId),defaults=SETTINGS_DEFAULTS[documentId]||{};if((init?.method||"GET")==="GET"){const snap=await getDoc(ref);return {[key]:{...defaults,...(snap.exists()?snap.data():{})}};}const b=bodyOf(init);await setDoc(ref,stripUndefinedDeep({...b,updatedAt:serverTimestamp()}),{merge:true});return {[key]:{...defaults,...b}};}

async function dashboard(){const [p,u,o,r]=await Promise.all([getDocs(collection(db,"siteProducts")),getDocs(collection(db,"users")),getDocs(collection(db,"siteOrders")),getDocs(collection(db,"siteReviews"))]);const orders=o.docs.map(d=>mapOrder({id:d.id,...d.data()}));return {products:{total:p.size,hidden:p.docs.filter(d=>!isProductPublished(d.data())).length,unavailable:p.docs.filter(d=>d.data().inStock===false).length},users:{total:u.size,active:u.docs.filter(d=>d.data().status!=="blocked").length,blocked:u.docs.filter(d=>d.data().status==="blocked").length},orders:{verified:orders.filter(x=>["verified","access_granted","completed"].includes(x.paymentStatus)).length,pending:orders.filter(x=>x.paymentStatus.includes("pending")).length,failed:orders.filter(x=>x.paymentStatus==="failed").length},revenue:{total:orders.filter(x=>x.paymentStatus!=="failed").reduce((n,x)=>n+Number(x.finalAmount),0)},subscriptions:{active:u.docs.filter(d=>d.data().subscriptionTier&&d.data().subscriptionTier!=="basic").length,expiring:0},reviews:{pending:r.docs.filter(d=>d.data().status==="pending").length},recentOrders:orders.slice(0,5),attentionQueue:[]};}

export async function adminFetch<T=unknown>(input:string,init?:RequestInit):Promise<T>{await ensureAdmin();const url=urlOf(input),p=url.pathname;
  let result:any;
  if(p==="/api/admin/auth/session")result={email:auth.currentUser?.email,role:"admin",adminId:auth.currentUser?.uid,createdAt:new Date().toISOString(),lastVerifiedAt:new Date().toISOString(),expiresAt:null};
  else if(p==="/api/admin/dashboard")result=await dashboard();
  else if(p.startsWith("/api/admin/products"))result=await productsRequest(url,init);
  else if(p.startsWith("/api/admin/customers"))result=await customersRequest(url,init);
  else if(p.startsWith("/api/admin/orders"))result=await ordersRequest(url);
  else if(p==="/api/admin/subscriptions/plans")result=await subscriptionPlansRequest(init);
  else if(p==="/api/admin/subscriptions/features")result=await subscriptionFeaturesRequest(init);
  else if(p==="/api/admin/subscriptions/products")result=await subscriptionPlanProductsRequest(init);
  else if(p==="/api/admin/subscriptions/referrals")result=await settingsRequest("referralProgram","settings",init);
  else if(p==="/api/admin/coupons")result=await genericCollection("siteCoupons","coupons",init);
  else if(p==="/api/admin/reviews")result=await genericCollection("siteReviews","reviews",init);
  else if(p==="/api/admin/content")result=await settingsRequest("adminContent","settings",init);
  else if(p.startsWith("/api/admin/analytics")){const [ordersRes,productsRes,customersRes,reviewsRes]=await Promise.all([ordersRequest(new URL("/api/admin/orders",url)),productsRequest(new URL("/api/admin/products",url)),customersRequest(new URL("/api/admin/customers",url)),genericCollection("siteReviews","reviews")]);const orders=(ordersRes as any).orders||[],products=(productsRes as any).products||[],customers=(customersRes as any).customers||[],reviews=(reviewsRes as any).reviews||[];const successful=orders.filter((o:any)=>!["failed","cancelled"].includes(o.paymentStatus)),revenue=successful.reduce((n:number,o:any)=>n+Number(o.finalAmount||0),0);result={range:{start:new Date(0).toISOString(),end:new Date().toISOString()},revenue,orders:orders.length,averageOrderValue:successful.length?revenue/successful.length:0,uniqueBuyers:new Set(successful.map((o:any)=>o.customerId)).size,newUsers:customers.length,paymentSuccessRate:orders.length?successful.length/orders.length*100:0,failedPayments:orders.filter((o:any)=>o.paymentStatus==="failed").length,topProducts:products.slice(0,5),activeSubscriptionPlans:0,averageReviewRating:reviews.length?reviews.reduce((n:number,r:any)=>n+Number(r.rating||0),0)/reviews.length:0,reviewsInRange:reviews.length};}
  else throw new ApiError(`Unsupported admin operation: ${p}`,404);
  return result as T;
}
