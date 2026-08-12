import { collection, deleteDoc, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { APPROVED_ADMIN_EMAIL, clearAdminSession, hasAdminSession } from "@/utils/adminSession";
import {
  editorModulesToFirestoreTree,
  editorPaidUpdateToFirestore,
  editorToFirestoreBody,
  firestoreToEditorForm,
} from "../../../utils/productMapping";
import type { ProductModule, ProductResource } from "./types";

export class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
const bodyOf = (init?: RequestInit) => init?.body ? JSON.parse(String(init.body)) as Record<string, any> : {};
const urlOf = (input: string) => new URL(input, window.location.origin);
const asDate = (value: any) => value?.toDate?.()?.toISOString?.() || String(value || new Date().toISOString());
const money = (value: any) => Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
const id = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

async function ensureAdmin() {
  const user = auth.currentUser;
  if (!user || !hasAdminSession(user.uid, user.email || "", "admin")) throw new ApiError("Admin session expired.", 401);
  const snap = await getDoc(doc(db, "users", user.uid));
  if (user.email?.toLowerCase() !== APPROVED_ADMIN_EMAIL || snap.data()?.role !== "admin") { clearAdminSession(); throw new ApiError("Admin access revoked.", 401); }
  return user;
}

function productForEditor(raw: any, documentId: string) {
  // Canonical round-trip: the mapping layer reconstructs the full editor
  // form (modules, paid updates, images, pricing) from the Firestore doc.
  // For docs written by the editor (which carry the `adminProduct` blob)
  // the mapping prefers the blob because it is the editor's own submission.
  return firestoreToEditorForm(raw, documentId);
}

async function productsRequest(url: URL, init?: RequestInit) {
  const method = init?.method || "GET"; const path = url.pathname; const match = path.match(/\/products\/([^/]+)$/);
  if (match) {
    const ref = doc(db, "siteProducts", decodeURIComponent(match[1]));
    if (method === "GET") { const snap = await getDoc(ref); if (!snap.exists()) throw new ApiError("Product not found",404); return { product: productForEditor(snap.data(), snap.id) }; }
    if (method === "DELETE") { await deleteDoc(ref); return { ok: true }; }
    if (method === "PATCH") { const body = bodyOf(init); await saveProduct(ref, body); return { product: body }; }
  }
  if (method === "POST") { const body = bodyOf(init); const ref = doc(db, "siteProducts", String(body.id || id())); await saveProduct(ref, body); return { product: { ...body, id: ref.id } }; }
  const snap = await getDocs(collection(db, "siteProducts"));
  let products = snap.docs.map((item) => { const p = productForEditor(item.data(), item.id); return { ...(p || {}), reviewCount: Number(item.data().reviewCount || 0), rating: String(item.data().rating || item.data().manualRating || 0), updatedAt: asDate(item.data().updatedAt), modules: (p && p.modules) || [], images: (p && p.images) || [] }; });
  const q=(url.searchParams.get("q")||"").toLowerCase(); if(q) products=products.filter((p:any)=>`${p.id} ${p.title} ${p.category}`.toLowerCase().includes(q));
  const visibility=url.searchParams.get("visibility"); if(visibility) products=products.filter((p:any)=>p.visibility===visibility);
  const availability=url.searchParams.get("availability"); if(availability) products=products.filter((p:any)=>p.availableForSale===(availability==="available"));
  const pricing=url.searchParams.get("pricing"); if(pricing) products=products.filter((p:any)=>Boolean(p.isFree)===(pricing==="free"));
  return { products };
}
async function saveProduct(ref: ReturnType<typeof doc>, body: any) {
  // Part 2 round-trip: use the canonical mapping layer to write the nested
  // courseContent tree and the paidUpdates catalogue with every
  // commerce/access field preserved (see utils/productMapping.js).
  const flatModules: ProductModule[] = body.modules || [];
  const courseContent = editorModulesToFirestoreTree(flatModules) as unknown[];
  const paidUpdates = (body.paidUpdates || []).map((u: ProductResource | unknown) => editorPaidUpdateToFirestore(u, flatModules)).filter(Boolean) as unknown[];
  const urls = (body.images || []).sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((i: any) => i.url);
  // The `adminProduct` blob is kept for older code paths that read
  // `raw.adminProduct` (the editor reload and the Firestore-to-Form
  // mapping both honour it).
  const adminProductBlob = editorToFirestoreBody(body)?.adminProduct ?? body;
  await setDoc(ref, {
    adminProduct: adminProductBlob,
    id: ref.id,
    title: body.title,
    description: body.shortDescription,
    longDescription: body.longDescription,
    instructor: body.instructor,
    category: body.category,
    subject: body.subject,
    sku: body.sku,
    tags: body.tags || [],
    keywords: body.searchKeywords || [],
    features: body.features || [],
    images: urls,
    productImages: { card: urls.find((_: any, i: number) => body.images[i]?.isPrimary) || urls[0] || "" },
    price: `₹${body.regularPrice || 0}`,
    salePrice: body.salePrice ? `₹${body.salePrice}` : null,
    coinPrice: body.coinPrice || 0,
    isFree: Boolean(body.isFree),
    isVisible: body.visibility === "visible",
    inStock: Boolean(body.availableForSale),
    manualRating: body.manualRating,
    dimensions: body.estimatedDuration,
    courseContent,
    paidUpdates,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function genericCollection(name: string, key: string, init?: RequestInit) {
  const method=init?.method||"GET"; const body=bodyOf(init); const col=collection(db,name);
  if(method==="GET"){const snap=await getDocs(col);return {[key]:snap.docs.map(d=>({id:d.id,...d.data()}))};}
  const recordId=String(body.id||id()); const ref=doc(db,name,recordId);
  if(body.delete){await deleteDoc(ref);return {ok:true};}
  await setDoc(ref,{...body,id:recordId,updatedAt:serverTimestamp()},{merge:true}); return {[key.replace(/s$/,"")]:{...body,id:recordId}};
}

async function customersRequest(url: URL, init?: RequestInit) {
  const parts=url.pathname.split("/").filter(Boolean); const uid=parts[3];
  if(uid){const ref=doc(db,"users",uid); const snap=await getDoc(ref); if(!snap.exists())throw new ApiError("Customer not found",404); let data=snap.data();
    if(parts[4]==="coins"&&init?.method==="POST"){const b=bodyOf(init),delta=(b.type==="spend"?-1:1)*Number(b.amount||0);await updateDoc(ref,{coinBalance:increment(delta),eduCoins:increment(delta),updatedAt:serverTimestamp()});await setDoc(doc(db,"users",uid,"coinTransactions",id()),{amount:delta,reason:b.reason,type:b.type,createdAt:serverTimestamp()});data={...data,coinBalance:Number(data.coinBalance||0)+delta};}
    else if(init?.method==="PATCH"){const b=bodyOf(init);await updateDoc(ref,{status:b.status,blocked:b.status==="blocked",updatedAt:serverTimestamp()});data={...data,status:b.status};}
    const orders=(await getDocs(collection(db,"siteOrders"))).docs.map(d=>({id:d.id,...d.data()})).filter((o:any)=>o.customerUid===uid).map(mapOrder);
    return {customer:mapCustomer(uid,data),orders,reviews:[]};}
  let rows=(await getDocs(collection(db,"users"))).docs.map(d=>mapCustomer(d.id,d.data())); const q=(url.searchParams.get("q")||"").toLowerCase();if(q)rows=rows.filter((r:any)=>`${r.uid} ${r.name} ${r.email}`.toLowerCase().includes(q));const s=url.searchParams.get("status");if(s)rows=rows.filter((r:any)=>r.status===s);const p=url.searchParams.get("provider");if(p && p !== null)rows=rows.filter((r:any)=>r.provider===p);return {customers:rows};
}
const mapCustomer=(uid:string,d:any)=>({uid,name:d.name||null,email:d.email||"",mobile:d.mobile||null,provider:d.authProvider||"password",role:d.role||"user",status:d.status||"active",coinBalance:Number(d.coinBalance??d.eduCoins??0),subscriptionId:d.subscriptionPlanId||null,purchaseCount:Array.isArray(d.purchasedProductIds)?d.purchasedProductIds.length:0,wishlist:d.wishlistProductIds||[],cart:d.cartProductIds||[],joinedAt:asDate(d.createdAt),lastLoginAt:asDate(d.lastLoginAt||d.updatedAt||d.createdAt),reportsReceived:0,removedContentCount:0,communityStatus:d.communityStatus||"active",suspensionStatus:d.suspended?"suspended":"active"});
const mapOrder=(d:any)=>({id:String(d.id||""),customerId:d.customerUid||"",customerName:d.customerName||null,customerEmail:d.customerEmail||null,purchaseKind:d.checkoutType||d.purchaseKind||"product",items:(d.items||[]).map((i:any,index:number)=>({id:String(i.id||index),kind:i.kind||"product",refId:String(i.id||""),title:i.name||i.title||"Item",price:money(i.price)})),couponCode:d.couponCode||null,coinsUsed:Number(d.coinsUsed||0),discountAmount:String(d.discountAmount||0),cashPaid:String(d.amountPaise?d.amountPaise/100:money(d.total)),finalAmount:String(d.amountPaise?d.amountPaise/100:money(d.total)),paymentStatus:String(d.paymentStatus||d.status||"verified").toLowerCase(),entitlementStatus:d.entitlementStatus||"access_granted",gatewayOrderId:d.gatewayOrderId||d.id||null,gatewayPaymentId:d.paymentId||null,grantedEntitlementIds:d.grantedEntitlementIds||[],failureReason:d.failureReason||null,createdAt:asDate(d.createdAt||d.date),verifiedAt:asDate(d.verifiedAt||d.createdAt||d.date)});

async function ordersRequest(url:URL){const match=url.pathname.match(/\/orders\/([^/]+)$/);const snap=await getDocs(collection(db,"siteOrders"));const rows=snap.docs.map(d=>mapOrder({id:d.id,...d.data()}));if(match){const order=rows.find(o=>o.id===decodeURIComponent(match[1]));if(!order)throw new ApiError("Order not found",404);return {order};}let result=rows;const q=(url.searchParams.get("q")||"").toLowerCase();if(q)result=result.filter(o=>`${o.id} ${o.customerName} ${o.customerEmail}`.toLowerCase().includes(q));const status=url.searchParams.get("status");if(status)result=result.filter(o=>o.paymentStatus===status);const kind=url.searchParams.get("kind");if(kind)result=result.filter(o=>o.purchaseKind===kind);return {orders:result};}

const SETTINGS_DEFAULTS:Record<string,any>={economy:{coinsPerVideoMinute:1,coinsPerPurchase:25,coinsToInrRatio:"1",maxCheckoutDiscountPercent:30},ai:{enabledModels:["gemini-1.5-flash"],defaultModel:"gemini-1.5-flash",communityAiAccess:true,courseAiAccess:true,userContextEnabled:false,courseContextEnabled:true,systemInstructions:"",contextTokenLimit:4000,dailyRequestLimit:50,rateLimitPerMinute:6,promptTemplates:[],safetyInstructions:"",clearHistoryPolicyDays:30,providerStatus:{gemini:"configured",openai:"not_configured"}},adminContent:{siteName:"Digital Catalyst",banners:[],categories:[],testimonials:[],storeTitle:"Store",storeSubtitle:"",showWishlist:true,showRatings:true,showSaleBadges:true,emptyStateMessages:{},pdpHelperTexts:{},coursePlayerMessages:{},authLabels:{openDashboardLabel:"Open dashboard"}}};
async function settingsRequest(documentId:string,key:string,init?:RequestInit){const ref=doc(db,"settings",documentId),defaults=SETTINGS_DEFAULTS[documentId]||{};if((init?.method||"GET")==="GET"){const snap=await getDoc(ref);return {[key]:{...defaults,...(snap.exists()?snap.data():{})}};}const b=bodyOf(init);await setDoc(ref,{...b,updatedAt:serverTimestamp()},{merge:true});return {[key]:{...defaults,...b}};}

async function dashboard(){const [p,u,o,b,s,c,r]=await Promise.all([getDocs(collection(db,"siteProducts")),getDocs(collection(db,"users")),getDocs(collection(db,"siteOrders")),getDocs(collection(db,"adminBadges")),getDocs(collection(db,"adminStreaks")),getDocs(collection(db,"adminChallenges")),getDocs(collection(db,"siteReviews"))]);const orders=o.docs.map(d=>mapOrder({id:d.id,...d.data()}));return {products:{total:p.size,hidden:p.docs.filter(d=>d.data().isVisible===false).length,unavailable:p.docs.filter(d=>d.data().inStock===false).length},users:{total:u.size,active:u.docs.filter(d=>d.data().status!=="blocked").length,blocked:u.docs.filter(d=>d.data().status==="blocked").length},orders:{verified:orders.filter(x=>["verified","access_granted","completed"].includes(x.paymentStatus)).length,pending:orders.filter(x=>x.paymentStatus.includes("pending")).length,failed:orders.filter(x=>x.paymentStatus==="failed").length},revenue:{total:orders.filter(x=>x.paymentStatus!=="failed").reduce((n,x)=>n+Number(x.finalAmount),0)},subscriptions:{active:u.docs.filter(d=>d.data().subscriptionTier&&d.data().subscriptionTier!=="basic").length,expiring:0},coins:{issued:0,redeemed:0},badges:{active:b.docs.filter(d=>d.data().status==="active").length},streaks:{active:s.docs.filter(d=>d.data().status==="active").length},challenges:{active:c.docs.filter(d=>d.data().status==="active").length},reviews:{pending:r.docs.filter(d=>d.data().status==="pending").length},moderation:{reported:0},recentOrders:orders.slice(0,5),attentionQueue:[]};}

export async function adminFetch<T=unknown>(input:string,init?:RequestInit):Promise<T>{await ensureAdmin();const url=urlOf(input),p=url.pathname;
  let result:any;
  if(p==="/api/admin/auth/session")result={email:auth.currentUser?.email,role:"admin",adminId:auth.currentUser?.uid,createdAt:new Date().toISOString(),lastVerifiedAt:new Date().toISOString(),expiresAt:null};
  else if(p==="/api/admin/dashboard")result=await dashboard();
  else if(p.startsWith("/api/admin/products"))result=await productsRequest(url,init);
  else if(p.startsWith("/api/admin/customers"))result=await customersRequest(url,init);
  else if(p.startsWith("/api/admin/orders"))result=await ordersRequest(url);
  else if(p==="/api/admin/rewards/badges")result=await genericCollection("adminBadges","badges",init);
  else if(p==="/api/admin/rewards/streaks")result=await genericCollection("adminStreaks","streaks",init);
  else if(p==="/api/admin/rewards/challenges")result=await genericCollection("adminChallenges","challenges",init);
  else if(p==="/api/admin/rewards/redeem-items")result=await genericCollection("adminRedeemItems","redeemItems",init);
  else if(p==="/api/admin/rewards/transactions")result=await genericCollection("rewardTransactions","transactions",init);
  else if(p==="/api/admin/rewards/coin-economy")result=await settingsRequest("economy","settings",init);
  else if(p==="/api/admin/subscriptions/plans")result=await genericCollection("subscriptionPlans","plans",init);
  else if(p==="/api/admin/subscriptions/features")result=await genericCollection("subscriptionFeatures","features",init);
  else if(p==="/api/admin/coupons")result=await genericCollection("siteCoupons","coupons",init);
  else if(p==="/api/admin/reviews")result=await genericCollection("siteReviews","reviews",init);
  else if(p==="/api/admin/ai-settings")result=await settingsRequest("ai","settings",init);
  else if(p==="/api/admin/content")result=await settingsRequest("adminContent","settings",init);
  else if(p.startsWith("/api/admin/moderation/reports"))result=await genericCollection("community_reports","reports",init);
  else if(p.startsWith("/api/admin/moderation/posts"))result=await genericCollection("community_feed","posts",init);
  else if(p.startsWith("/api/admin/moderation/comments"))result=await genericCollection("community_comments","comments",init);
  else if(p.startsWith("/api/admin/analytics")){const [ordersRes,productsRes,customersRes,reviewsRes]=await Promise.all([ordersRequest(new URL("/api/admin/orders",url)),productsRequest(new URL("/api/admin/products",url)),customersRequest(new URL("/api/admin/customers",url)),genericCollection("siteReviews","reviews")]);const orders=(ordersRes as any).orders||[],products=(productsRes as any).products||[],customers=(customersRes as any).customers||[],reviews=(reviewsRes as any).reviews||[];const successful=orders.filter((o:any)=>!["failed","cancelled"].includes(o.paymentStatus)),revenue=successful.reduce((n:number,o:any)=>n+Number(o.finalAmount||0),0);result={range:{start:new Date(0).toISOString(),end:new Date().toISOString()},revenue,orders:orders.length,averageOrderValue:successful.length?revenue/successful.length:0,uniqueBuyers:new Set(successful.map((o:any)=>o.customerId)).size,newUsers:customers.length,paymentSuccessRate:orders.length?successful.length/orders.length*100:0,failedPayments:orders.filter((o:any)=>o.paymentStatus==="failed").length,topProducts:products.slice(0,5),coinsIssued:0,coinsRedeemed:0,activeSubscriptionPlans:0,averageReviewRating:reviews.length?reviews.reduce((n:number,r:any)=>n+Number(r.rating||0),0)/reviews.length:0,reviewsInRange:reviews.length};}
  else throw new ApiError(`Unsupported admin operation: ${p}`,404);
  return result as T;
}
