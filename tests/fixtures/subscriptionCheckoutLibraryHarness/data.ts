import type { Product } from "../../../src/data/products";
import type { MyCourse } from "../../../src/types/myCourse";
import type { CanonicalCourseModule } from "../../../src/types/commerce";
import type {
  SubscriptionCatalog,
  SubscriptionPlanDoc,
} from "../../../src/subscription/utils/subscriptionCatalog";
const params = new URLSearchParams(location.search);
const cover = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#172a47"/><path d="M45 130L120 35L195 130" fill="none" stroke="#bcb4ef" stroke-width="6"/></svg>'
)}`;
const product = (id: string, title: string, price: number, extra = {}): Product => ({
  id,
  title,
  price,
  originalPrice: price,
  image: cover,
  instructor: "Meera Rao",
  category: "Course",
  classLevel: "12",
  subject: "Physics",
  tags: [],
  rating: 4.8,
  reviews: 12,
  ...extra,
});
const moduleEntry = (
  id: string,
  title: string,
  modules: CanonicalCourseModule[] = []
): CanonicalCourseModule => ({
  id,
  title,
  description: "Lesson module",
  sortOrder: 1,
  visibility: "visible" as const,
  active: true,
  accessLevel: "purchasable" as const,
  individuallyPurchasable: true,
  cashPrice: 9995,
  salePrice: null,
  coinPrice: null,
  includeInBundle: true,
  previewAvailable: false,
  requiredPreviousModuleIds: [],
  entitlementId: id,
  badge: null,
  parentModuleId: null,
  resources: [],
  modules,
});
export const products = [
  product(
    "alpha",
    params.has("long")
      ? "A very long course title with detailed lessons and explanations ".repeat(3)
      : "Waves and optics",
    149.95,
    {
      documentId: "alpha-doc",
      originalPrice: 229.95,
      canonicalModules: [
        moduleEntry("waves", "Wave motion"),
        moduleEntry("root", "Optics", [moduleEntry("optics", "Ray optics")]),
      ],
    }
  ),
  product("beta", "Thermodynamics", 399.5),
  product("owned", "Already purchased mechanics", 99.95, { documentId: "owned-doc" }),
  product("bonus", "Plan study handbook", 0),
];
const allowance = { dailyGenerationLimit: 20, dailyTokenBudget: 12500, costBudgetMicros: 2000000 };
const plan = (
  id: string,
  name: string,
  monthly: number,
  yearly: number,
  sortOrder: number
): SubscriptionPlanDoc => ({
  id,
  name,
  description: `${name} study membership`,
  monthlyPricePaise: params.has("free") ? 0 : monthly,
  yearlyPricePaise: params.has("free") ? 0 : yearly,
  active: true,
  includedFeatureIds: ["notes"],
  includedProductIds: ["bonus"],
  includedModuleKeys: params.has("moduleUnlocks") ? ["alpha-doc:waves", "alpha-doc:optics"] : [],
  allowedCycles: params.has("yearOnly") && id === "basic" ? ["yearly"] : ["monthly", "yearly"],
  minPayablePaise: params.has("free") ? 0 : 1995,
  trialDays: 0,
  autoRenewByDefault: false,
  sortOrder,
  revisionTestBankLimits: { monthly: 20, yearly: -1 },
  aiAllowances: { monthly: allowance, yearly: allowance },
  subscriberPricingOverride:
    id === "premium" ? { monthly: 199.25, yearly: 1999.25, lifetime: null } : null,
});
export const catalog: SubscriptionCatalog = {
  plans: [
    plan("basic", "Basic", 12995, 129995, 1),
    plan("premium", "Premium", 22995, 229995, 2),
    plan("pro", "Pro", 34995, 349995, 3),
  ],
  features: [
    {
      id: "my-day",
      name: "My Day",
      description: "Cloud tasks and notes",
      icon: "calendar",
      pricePaise: 2995,
      yearlyPricePaise: 29950,
      included: false,
      active: true,
      sortOrder: 1,
    },
    {
      id: "revision",
      name: "Roman AI Pro",
      description: "AI practice and test generation",
      icon: "brain",
      pricePaise: 7900,
      yearlyPricePaise: 79000,
      included: false,
      active: true,
      sortOrder: 2,
    },
    {
      id: "notes",
      name: "Study notes",
      description: "Included reference notes",
      icon: "download",
      pricePaise: 0,
      included: true,
      active: true,
      sortOrder: 3,
    },
    {
      id: "lab",
      name: "Practice lab",
      description: "Yearly-only practice",
      icon: "brain",
      pricePaise: 3995,
      yearlyPricePaise: 39950,
      visibleCycles: ["yearly"],
      included: false,
      active: true,
      sortOrder: 4,
    },
    {
      id: "advanced",
      name: "Advanced planner",
      description: "Higher-plan planner",
      icon: "calendar",
      pricePaise: 4995,
      hiddenPlanIds: ["basic"],
      included: false,
      active: true,
      sortOrder: 5,
    },
  ].map((feature) =>
    params.has("free") ? { ...feature, pricePaise: 0, yearlyPricePaise: 0 } : feature
  ),
  productUnlocks: [{ planId: "basic", productId: "bonus", active: true }],
  moduleUnlocks: params.has("moduleUnlocks")
    ? ["basic", "premium"].flatMap((planId) => [
        { planId, productId: "alpha", moduleId: "waves", active: true },
        { planId, productId: "alpha", moduleId: "optics", active: true },
      ])
    : [],
  subscriptionProducts: [
    {
      id: "beta",
      productId: "beta",
      pricePaise: 39950,
      planPricing: { premium: { monthly: 249.95, yearly: 249.95 } },
      included: false,
      active: true,
    },
  ],
};
export const member = params.has("member")
  ? {
      status: "active",
      planId: "premium",
      cycle: params.has("yearlyMember") ? "yearly" : "monthly",
      features: ["my-day", "notes"],
      includedProductIds: ["alpha-doc"],
      expiresAt: Date.now() + 86400000 * (params.has("renewal") ? 3 : 180),
    }
  : null;
export const courses: MyCourse[] = [
  {
    id: "course-one",
    uid: "fixture",
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 2,
    title: params.has("long")
      ? "My detailed course with an exceptionally long but meaningful title ".repeat(3)
      : "My physics course",
    description: "Waves, optics and revision",
    coverImage: params.has("brokenCover") ? "/missing-course-cover.png" : cover,
    modules: [
      {
        id: "m1",
        title: "Waves",
        resources: [
          { id: "r1", name: "Study PDF", type: "pdf", url: "https://example.test/study.pdf" },
        ],
        modules: [
          {
            id: "folder",
            title: "Practice",
            resources: [
              {
                id: "r2",
                name: "Revision video",
                type: "video",
                url: "https://example.test/video",
              },
            ],
            modules: [],
          },
        ],
      },
    ],
  },
  {
    id: "course-two",
    uid: "fixture",
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 2,
    title: "Biology notes",
    description: "Plant science",
    coverImage: cover,
    modules: [{ id: "m2", title: "Plants", resources: [], modules: [] }],
  },
] as MyCourse[];
