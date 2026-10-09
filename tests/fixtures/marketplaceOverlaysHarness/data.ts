import type { Product } from "../../../src/data/products";
import type { CanonicalCourseModule } from "../../../src/types/commerce";
const params = new URLSearchParams(location.search);
export const cover = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#20243b"/><path d="M80 250L240 70L400 250" fill="none" stroke="#bfb6ef" stroke-width="10"/></svg>'
)}`;
const product = (
  id: string,
  title: string,
  price: number,
  extra = {}
): Product => ({
  id,
  title,
  price,
  originalPrice: price,
  image: cover,
  instructor: "Meera Rao",
  category: "Course",
  classLevel: "12",
  subject: "Physics",
  tags: ["revision"],
  rating: 4.8,
  reviews: 32,
  ...extra,
});
export const products = [
  product("alpha", "Waves and optics", 149.95, {
    documentId: "alpha-doc",
    originalPrice: 299.95,
  }),
  product("zero", "Free revision notes", 0, {
    originalPrice: 199.95,
    category: "Notes",
  }),
  product("free-flag", "Open chemistry course", 399.95, {
    isFree: true,
    originalPrice: 699.95,
    subject: "Chemistry",
  }),
  product("no-mrp", "Reference PDF", 0, {
    originalPrice: 0,
    category: "PDF",
    rating: 0,
    reviews: 0,
  }),
  product("owned", "Mechanics course", 399.5),
  product("not-sale", "Upcoming live class", 599.5, {
    category: "Live",
    availableForSale: false,
  }),
  product("ebook", "Biology handbook", 499.95, {
    category: "E-book",
    subject: "Biology",
  }),
  product(
    "expensive",
    params.has("long")
      ? "Comprehensive digital course with a descriptive title ".repeat(4)
      : "Advanced mathematics",
    9123456789.55,
    { originalPrice: 9234567890.75 }
  ),
  product("broken", "Course with custom artwork", 229.95, {
    image: "/no-cover.png",
  }),
];
export const filters = [
  {
    id: "revision",
    label: "Revision",
    active: true,
    match: { keyword: "revision" },
  },
  {
    id: "biology",
    label: "Biology",
    active: true,
    match: { subject: "Biology" },
  },
];
const module = (
  id: string,
  title: string,
  price: number,
  extra = {}
): CanonicalCourseModule => ({
  id,
  title,
  description: "Named study lessons",
  sortOrder: 1,
  visibility: "visible",
  active: true,
  accessLevel: "purchasable",
  individuallyPurchasable: true,
  cashPrice: price,
  salePrice: null,
  coinPrice: null,
  includeInBundle: true,
  previewAvailable: false,
  requiredPreviousModuleIds: [],
  entitlementId: id,
  badge: null,
  parentModuleId: null,
  resources: [],
  modules: [],
  ...extra,
});
export const modules = [
  module("owned", "Already-owned introduction", 199.95),
  module("waves", "Wave motion", 149.95, { salePrice: 99.95 }),
  module("optics", "Ray optics", 129.95, {
    requiredPreviousModuleIds: ["waves"],
  }),
  module("free", "Bonus practice", 0),
  ...Array.from({ length: 24 }, (_, i) =>
    module("extra" + i, "Further study module " + (i + 1), 49.95)
  ),
];
export const course = {
  id: "course-one",
  uid: "fixture",
  schemaVersion: 1,
  title: "My physics course",
  description: "My study resources",
  coverImage: cover,
  createdAt: 1,
  updatedAt: 2,
  modules: [
    {
      id: "module-one",
      title: "Waves",
      description: "Wave theory",
      createdAt: 1,
      updatedAt: 2,
      modules: [],
      resources: [
        {
          id: "pdf-one",
          type: "pdf",
          name: "Study PDF",
          url: "https://example.test/study.pdf",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    },
  ],
};
export const leaderboard = {
  users: Array.from({ length: 45 }, (_, i) => ({
    uid: "member" + i,
    name:
      i === 0 && params.has("long")
        ? "A learner with a very long descriptive display name ".repeat(3)
        : "Learner " + (i + 1),
    photoURL: i === 0 ? "/missing-photo.png" : null,
  })),
  subscribers: [
    {
      uid: "member0",
      name: "Ananya Sharma",
      photoURL: null,
      planId: "premium",
      referralCode: params.has("long") ? "LONGCODE".repeat(30) : "AVAILABLE250",
      usedCount: 0,
      available: true,
    },
    {
      uid: "member1",
      name: "Meera Rao",
      photoURL: null,
      planId: "basic",
      referralCode: "USED250",
      usedCount: 1,
      available: false,
    },
    {
      uid: "member2",
      name: "Ravi Kumar",
      photoURL: null,
      planId: "pro",
      referralCode: "UNAVAILABLE",
      usedCount: 0,
      available: false,
    },
  ],
};
