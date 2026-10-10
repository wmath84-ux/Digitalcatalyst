import type { Product } from "../../../src/data/products";
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300"><rect width="480" height="300" fill="#242a41"/><rect x="165" y="40" width="150" height="220" rx="8" fill="#c1baff"/></svg>')}`;
const base = { title: "Mathematics essentials", instructor: "Dr. Ananya Sharma", category: "Course", price: 999, originalPrice: 1499, rating: 4.8, reviews: 24, classLevel: "Class 12", subject: "Mathematics", description: "Focused lessons with worked examples.", tags: [], image, canonicalModules: [], paidUpdates: [] };
export const products = [
  { ...base, id: "full", title: "Complete mathematics" },
  { ...base, id: "partial", title: "Algebra and geometry", canonicalModules: [{ id: "m1", title: "Algebra", modules: [], resources: [] }, { id: "m2", title: "Geometry", modules: [], resources: [] }] },
  { ...base, id: "plan", title: "Physics through your plan" },
  { ...base, id: "book", title: "VeryLongUnbrokenStudyBookTitleThatMustRemainReadableOnNarrowPhones", category: "E-book", image: "/fixture-missing-book-image.png" },
] as Product[];
