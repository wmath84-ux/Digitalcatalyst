import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import {
  Boxes,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  PackagePlus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { db } from "../../firebase";
import CourseUrlBuilder from "./CourseUrlBuilder";
import { useAuth } from "../context/AuthContext";
import { sanitizeUrlOnlyCourseContent } from "../utils/courseContent";
import type { CourseModule } from "../types/course";

type AdminView = "overview" | "products" | "users";
type SaveState = "idle" | "saving" | "success" | "error";

type AdminProduct = {
  id: string;
  title: string;
  description: string;
  price: string;
  category: string;
  image: string;
  isVisible: boolean;
  inStock: boolean;
  raw: DocumentData;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  coins: number;
  provider: string;
};

type ProductForm = {
  id: string;
  title: string;
  description: string;
  price: string;
  category: string;
  image: string;
  tags: string;
  paymentLink: string;
  isVisible: boolean;
  inStock: boolean;
  courseContent: CourseModule[];
};

const emptyProductForm = (): ProductForm => ({
  id: "",
  title: "",
  description: "",
  price: "",
  category: "Online Courses",
  image: "",
  tags: "",
  paymentLink: "",
  isVisible: true,
  inStock: true,
  courseContent: [],
});

const cleanPrice = (value: string) => value.replace(/[^0-9.]/g, "");
const displayPrice = (value: string) => {
  const amount = Number(cleanPrice(value));
  return Number.isFinite(amount) ? `₹${amount.toLocaleString("en-IN")}` : value;
};

const toAdminProduct = (id: string, data: DocumentData): AdminProduct => ({
  id: String(data.id ?? id),
  title: String(data.title || "Untitled product"),
  description: String(data.description || ""),
  price: String(data.salePrice || data.price || "₹0"),
  category: String(data.category || "Digital Product"),
  image: String(data.productImages?.card || data.images?.[0] || data.image || ""),
  isVisible: data.isVisible !== false,
  inStock: data.inStock !== false,
  raw: data,
});

const toManagedUser = (id: string, data: DocumentData): ManagedUser => ({
  id,
  name: String(data.name || data.displayName || "Learner"),
  email: String(data.email || ""),
  role: String(data.role || "user"),
  status: data.status === "blocked" || data.blocked === true ? "blocked" : "active",
  coins: Number(data.coinBalance ?? data.eduCoins ?? 0),
  provider: String(data.authProvider || "password"),
});

function AccessDenied() {
  const { logout } = useAuth();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-950 px-6 text-center text-white">
      <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <ShieldCheck className="mx-auto h-12 w-12 text-rose-400" />
        <h1 className="mt-4 text-2xl font-black">Admin access required</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">This Firebase account does not have an admin or super-admin role.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={() => { window.location.hash = "#/store"; }} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold hover:bg-white/5">Back to store</button>
          <button onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold">Sign out</button>
        </div>
      </div>
    </main>
  );
}

export default function AdminApp() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<AdminView>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [usersReady, setUsersReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProductForm);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [formError, setFormError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (!isAdmin) return undefined;
    setLoadError("");

    const unsubscribeProducts = onSnapshot(collection(db, "siteProducts"), (snapshot) => {
      const next = snapshot.docs
        .map((item) => toAdminProduct(item.id, item.data()))
        .sort((a, b) => a.title.localeCompare(b.title));
      setProducts(next);
      setProductsReady(true);
    }, (error) => {
      console.error("Admin product sync failed", error);
      setLoadError("Products could not be loaded. Check deployed Firestore rules and admin role.");
      setProductsReady(true);
    });

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const next = snapshot.docs
        .map((item) => toManagedUser(item.id, item.data()))
        .sort((a, b) => a.name.localeCompare(b.name));
      setUsers(next);
      setUsersReady(true);
    }, (error) => {
      console.error("Admin user sync failed", error);
      setLoadError("Users could not be loaded. Check deployed Firestore rules and admin role.");
      setUsersReady(true);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeUsers();
    };
  }, [isAdmin]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) => [product.title, product.category, product.description, product.id].join(" ").toLowerCase().includes(normalized));
  }, [products, query]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((item) => [item.name, item.email, item.role, item.status].join(" ").toLowerCase().includes(normalized));
  }, [users, query]);

  if (!user || !isAdmin) return <AccessDenied />;

  const openCreateProduct = () => {
    setEditingProduct(null);
    setForm(emptyProductForm());
    setFormError("");
    setSaveState("idle");
    setEditorOpen(true);
  };

  const openEditProduct = (product: AdminProduct) => {
    setEditingProduct(product);
    setForm({
      id: product.id,
      title: product.title,
      description: product.description,
      price: cleanPrice(product.price),
      category: product.category,
      image: product.image,
      tags: Array.isArray(product.raw.tags) ? product.raw.tags.join(", ") : "",
      paymentLink: String(product.raw.paymentLink || ""),
      isVisible: product.isVisible,
      inStock: product.inStock,
      courseContent: sanitizeUrlOnlyCourseContent(product.raw.courseContent),
    });
    setFormError("");
    setSaveState("idle");
    setEditorOpen(true);
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    const title = form.title.trim();
    const price = Number(cleanPrice(form.price));
    if (title.length < 3) {
      setFormError("Product title must be at least 3 characters.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormError("Enter a valid non-negative price.");
      return;
    }

    setSaveState("saving");
    try {
      const productId = editingProduct?.id || form.id.trim() || String(Date.now());
      const existing = editingProduct?.raw || {};
      const image = form.image.trim();
      await setDoc(doc(db, "siteProducts", productId), {
        ...existing,
        id: Number.isFinite(Number(productId)) ? Number(productId) : productId,
        title,
        description: form.description.trim(),
        longDescription: String(existing.longDescription || form.description.trim()),
        price: displayPrice(form.price),
        category: form.category.trim() || "Digital Product",
        images: image ? [image, ...(Array.isArray(existing.images) ? existing.images.filter((item: unknown) => String(item) !== image) : [])] : (existing.images || []),
        imageSeed: String(existing.imageSeed || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")),
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        paymentLink: form.paymentLink.trim(),
        isVisible: form.isVisible,
        inStock: form.inStock,
        features: Array.isArray(existing.features) ? existing.features : [],
        courseContent: sanitizeUrlOnlyCourseContent(form.courseContent),
        updatedAt: serverTimestamp(),
        ...(editingProduct ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true });
      setSaveState("success");
      window.setTimeout(() => setEditorOpen(false), 450);
    } catch (error) {
      console.error("Admin product save failed", error);
      setSaveState("error");
      setFormError(error instanceof Error ? error.message : "Product could not be saved.");
    }
  };

  const removeProduct = async (product: AdminProduct) => {
    if (!window.confirm(`Delete “${product.title}”? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "siteProducts", product.id));
    } catch (error) {
      console.error("Admin product delete failed", error);
      window.alert(error instanceof Error ? error.message : "Product could not be deleted.");
    }
  };

  const toggleUserStatus = async (managedUser: ManagedUser) => {
    if (managedUser.id === user.id) return;
    const nextStatus = managedUser.status === "blocked" ? "active" : "blocked";
    try {
      await updateDoc(doc(db, "users", managedUser.id), {
        status: nextStatus,
        blocked: nextStatus === "blocked",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Admin user status update failed", error);
      window.alert(error instanceof Error ? error.message : "User status could not be updated.");
    }
  };

  const navigate = (next: AdminView) => {
    setView(next);
    setQuery("");
    setMenuOpen(false);
  };

  const navItems: Array<{ id: AdminView; label: string; icon: typeof LayoutDashboard }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "products", label: "Products", icon: Boxes },
    { id: "users", label: "Users", icon: Users },
  ];

  const ready = productsReady && usersReady;

  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 md:hidden" aria-label="Open admin menu"><Menu size={19} /></button>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 font-black text-white">DC</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">Digital Catalyst Admin</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
          <button type="button" onClick={() => { window.location.hash = "#/store"; }} className="ml-auto hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold sm:flex"><ExternalLink size={15} /> Store</button>
          <button type="button" onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white" aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${view === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={18} />{item.label}</button>;
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {loadError && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{loadError}</div>}
          {!ready ? (
            <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto h-9 w-9 animate-spin text-violet-600" /><p className="mt-3 text-sm font-semibold text-slate-500">Syncing Firebase admin data…</p></div></div>
          ) : view === "overview" ? (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Live Firebase data</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Operations overview</h1>
              <p className="mt-2 text-sm text-slate-500">Manage the current catalog and customer access from one verified workspace.</p>
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <button onClick={() => navigate("products")} className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><Boxes className="text-violet-600" /><p className="mt-6 text-3xl font-black">{products.length}</p><p className="mt-1 text-sm font-semibold text-slate-500">Catalog products</p></button>
                <button onClick={() => navigate("users")} className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><Users className="text-cyan-600" /><p className="mt-6 text-3xl font-black">{users.length}</p><p className="mt-1 text-sm font-semibold text-slate-500">Registered users</p></button>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><ShieldCheck className="text-emerald-600" /><p className="mt-6 text-lg font-black capitalize">{user.role.replace("_", " ")}</p><p className="mt-1 text-sm font-semibold text-slate-500">Verified access level</p></div>
              </div>
            </section>
          ) : view === "products" ? (
            <section>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Catalog</p><h1 className="mt-2 text-3xl font-black">Products</h1></div>
                <button onClick={openCreateProduct} className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><PackagePlus size={18} /> Add product</button>
              </div>
              <SearchField value={query} onChange={setQuery} placeholder="Search products…" />
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {filteredProducts.length === 0 ? <EmptyState label="No products found" /> : filteredProducts.map((product) => (
                  <div key={product.id} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <Boxes className="m-4 text-slate-300" />}</div>
                    <button onClick={() => openEditProduct(product)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-black">{product.title}</p><p className="mt-1 truncate text-xs text-slate-500">{product.category} · {displayPrice(product.price)} · {product.isVisible ? "Visible" : "Hidden"}</p></button>
                    <button onClick={() => openEditProduct(product)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Edit</button>
                    <button onClick={() => void removeProduct(product)} className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" aria-label={`Delete ${product.title}`}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Accounts</p><h1 className="mt-2 text-3xl font-black">Users</h1></div>
              <SearchField value={query} onChange={setQuery} placeholder="Search users…" />
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {filteredUsers.length === 0 ? <EmptyState label="No users found" /> : filteredUsers.map((managedUser) => (
                  <div key={managedUser.id} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-sm font-black text-white">{managedUser.name.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{managedUser.name}</p><p className="truncate text-xs text-slate-500">{managedUser.email || managedUser.id}</p></div>
                    <div className="hidden text-right sm:block"><p className="text-xs font-bold capitalize">{managedUser.role}</p><p className="text-[11px] text-amber-600">{managedUser.coins} coins</p></div>
                    <button disabled={managedUser.id === user.id} onClick={() => void toggleUserStatus(managedUser)} className={`rounded-lg px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${managedUser.status === "blocked" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{managedUser.status === "blocked" ? "Activate" : "Block"}</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {menuOpen && <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/50" /><aside className="absolute bottom-0 left-0 top-0 w-72 bg-white p-4 shadow-2xl"><div className="mb-6 flex items-center justify-between"><p className="font-black">Admin menu</p><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100"><X size={18} /></button></div><nav className="space-y-1">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${view === item.id ? "bg-slate-950 text-white" : "text-slate-600"}`}><Icon size={18} />{item.label}</button>; })}</nav></aside></div>}

      {editorOpen && <ProductEditor form={form} setForm={setForm} editing={Boolean(editingProduct)} saveState={saveState} error={formError} onClose={() => setEditorOpen(false)} onSubmit={saveProduct} />}
    </div>
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mt-6 flex max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><Search size={17} className="text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-12 text-center text-sm font-semibold text-slate-400">{label}</div>;
}

function ProductEditor({ form, setForm, editing, saveState, error, onClose, onSubmit }: {
  form: ProductForm;
  setForm: React.Dispatch<React.SetStateAction<ProductForm>>;
  editing: boolean;
  saveState: SaveState;
  error: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100";
  const update = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6">
      <form onSubmit={onSubmit} className="max-h-[95dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        <div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Firebase catalog</p><h2 className="mt-1 text-2xl font-black">{editing ? "Edit product" : "Add product"}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X size={18} /></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {!editing && <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Product ID (optional)</span><input value={form.id} onChange={(event) => update("id", event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} className={field} placeholder="Auto-generated when blank" /></label>}
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Title</span><input required value={form.title} onChange={(event) => update("title", event.target.value)} className={field} placeholder="Product title" /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Description</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} className={field} rows={3} placeholder="Short storefront description" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Price (INR)</span><input required inputMode="decimal" value={form.price} onChange={(event) => update("price", event.target.value)} className={field} placeholder="499" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Category</span><input value={form.category} onChange={(event) => update("category", event.target.value)} className={field} placeholder="Online Courses" /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Primary image URL</span><input type="url" value={form.image} onChange={(event) => update("image", event.target.value)} className={field} placeholder="https://…" /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Tags (comma separated)</span><input value={form.tags} onChange={(event) => update("tags", event.target.value)} className={field} placeholder="course, science, class 10" /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Razorpay payment link (optional)</span><input type="url" value={form.paymentLink} onChange={(event) => update("paymentLink", event.target.value)} className={field} placeholder="https://pages.razorpay.com/…" /></label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-bold"><input type="checkbox" checked={form.isVisible} onChange={(event) => update("isVisible", event.target.checked)} className="h-4 w-4 accent-violet-600" /> Visible in store</label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-bold"><input type="checkbox" checked={form.inStock} onChange={(event) => update("inStock", event.target.checked)} className="h-4 w-4 accent-violet-600" /> Available for sale</label>
        </div>
        <CourseUrlBuilder modules={form.courseContent} onChange={(courseContent) => update("courseContent", courseContent)} />
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black">Cancel</button><button disabled={saveState === "saving"} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saveState === "saving" && <LoaderCircle size={17} className="animate-spin" />}{saveState === "success" ? "Saved" : saveState === "saving" ? "Saving…" : "Save product"}</button></div>
      </form>
    </div>
  );
}
