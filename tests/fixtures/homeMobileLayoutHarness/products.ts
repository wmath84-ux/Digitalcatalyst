import type { Product } from "../../../src/data/products";

const artwork = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#46418b"/><circle cx="800" cy="450" r="250" fill="#c4b5fd"/></svg>')}`;

/** Stress real card layouts with long copy, Indian currency, and every filter. */
export const products: Product[] = [
  { id: "course", title: "Complete mathematics: algebra, geometry and advanced problem solving", category: "Course", price: 1299, originalPrice: 2499, rating: 4.9, reviews: 1240 },
  { id: "pdf", title: "भौतिक विज्ञान — गति और ऊर्जा की सम्पूर्ण तैयारी", category: "PDF", price: 123456, originalPrice: 199999, rating: 4.8, reviews: 1234567 },
  { id: "book", title: "VeryLongUnbrokenBookTitleThatMustNotPushItsPriceOutsideTheCard", category: "E-book", price: 0, originalPrice: 0, rating: 4.7, reviews: 45 },
  { id: "live", title: "Live science workshop", category: "Live", price: 599, originalPrice: 999, rating: 4.6, reviews: 20 },
].map((product) => ({
  ...product,
  image: artwork,
  instructor: "Dr. Ananya Sharma",
  classLevel: "Class 12",
  subject: "Mathematics and science",
  description: "Focused lessons and practical examples you can revisit at your own pace.",
  tags: ["TRENDING", ...(product.id === "course" ? ["FEATURED"] : [])],
  status: "published",
  canonicalModules: product.id === "course" ? [{
    id: "algebra",
    title: "Algebra",
    sortOrder: 0,
    pricePaise: 0,
    resources: [{ id: "lesson", name: "Linear equations", type: "video", sortOrder: 0, pricePaise: 0, url: "" }],
    modules: [],
  }] : [],
})) as Product[];
