import type {
  Badge,
  Coupon,
  CoinTransaction,
  DownloadItem,
  EduUser,
  LeaderboardUser,
  LibraryItem,
  Membership,
  MembershipPlan,
  NotificationSettings,
  PrivacySettings,
} from "./types";

export const initialUser: EduUser = {
  name: "Aarav Sharma",
  email: "aarav.sharma@eduhive.com",
  phone: "+91 98765 43210",
  bio: "Lifelong learner • Aspiring Data Scientist",
  initials: "AS",
  referralId: "EDU-7F3K9Q",
  joinDate: "March 2023",
};

export const membershipPlans: MembershipPlan[] = [
  {
    id: "basic",
    name: "Basic",
    price: "Free",
    tagline: "Get started with limited access",
    perks: ["5 free courses / month", "Community forum access", "Ads supported"],
    color: "from-slate-500 to-slate-700",
  },
  {
    id: "pro",
    name: "Scholar Pro",
    price: "₹299/mo",
    tagline: "For dedicated learners",
    perks: [
      "Unlimited courses & PDFs",
      "Offline downloads",
      "Ad-free experience",
      "2x EduCoins on every activity",
    ],
    color: "from-indigo-500 to-violet-600",
  },
  {
    id: "elite",
    name: "Elite Premium",
    price: "₹599/mo",
    tagline: "The ultimate learning experience",
    perks: [
      "Everything in Scholar Pro",
      "1-on-1 mentor sessions",
      "Verified certificates",
      "Priority support 24/7",
      "5x EduCoins on every activity",
    ],
    color: "from-amber-500 to-orange-600",
  },
];

export const initialMembership: Membership = {
  planId: "basic",
  renewalDate: "—",
};

export const initialCoinHistory: CoinTransaction[] = [
  { id: "t1", type: "earn", amount: 50, reason: "Completed 'React Basics' course", date: "2 days ago" },
  { id: "t2", type: "earn", amount: 20, reason: "Daily login streak bonus", date: "3 days ago" },
  { id: "t3", type: "spend", amount: 100, reason: "Redeemed 10% off coupon", date: "5 days ago" },
  { id: "t4", type: "earn", amount: 30, reason: "Referred a friend (EDU-2KX01)", date: "1 week ago" },
  { id: "t5", type: "earn", amount: 15, reason: "Quiz champion bonus", date: "1 week ago" },
];

export const initialPurchases: LibraryItem[] = [
  { id: "p1", title: "Complete Python Bootcamp", type: "Course", emoji: "🐍", progress: 72 },
  { id: "p2", title: "Data Structures Handbook", type: "PDF", emoji: "📘", progress: 100 },
  { id: "p3", title: "UI/UX Design Mastery", type: "Course", emoji: "🎨", progress: 34 },
  { id: "p4", title: "Machine Learning Basics eBook", type: "Ebook", emoji: "🤖", progress: 10 },
];

export const initialFavorites: LibraryItem[] = [
  { id: "f1", title: "Advanced JavaScript Patterns", type: "Course", emoji: "⚡" },
  { id: "f2", title: "System Design Interview Guide", type: "PDF", emoji: "🧩" },
  { id: "f3", title: "Public Speaking for Students", type: "Course", emoji: "🎤" },
];

export const initialDownloads: DownloadItem[] = [
  { id: "d1", title: "Complete Python Bootcamp - Ch.4", size: "128 MB", type: "Video" },
  { id: "d2", title: "Data Structures Handbook", size: "12 MB", type: "PDF" },
  { id: "d3", title: "UI/UX Design Mastery - Ch.1", size: "96 MB", type: "Video" },
];

export const initialBadges: Badge[] = [
  { id: "b1", name: "First Step", icon: "🎯", earned: true, description: "Completed your first course", progress: 1, goal: 1 },
  { id: "b2", name: "7-Day Streak", icon: "🔥", earned: true, description: "Logged in 7 days in a row", progress: 7, goal: 7 },
  { id: "b3", name: "Quiz Wizard", icon: "🧙", earned: true, description: "Scored 100% on 5 quizzes", progress: 5, goal: 5 },
  { id: "b4", name: "Bookworm", icon: "📚", earned: false, description: "Read 10 PDFs / eBooks", progress: 6, goal: 10 },
  { id: "b5", name: "Referral Star", icon: "🌟", earned: false, description: "Refer 5 friends to EduHive", progress: 2, goal: 5 },
  { id: "b6", name: "30-Day Legend", icon: "🏆", earned: false, description: "Maintain a 30 day streak", progress: 12, goal: 30 },
  { id: "b7", name: "Coin Collector", icon: "🪙", earned: false, description: "Earn 1000 EduCoins", progress: 415, goal: 1000 },
  { id: "b8", name: "Top 10 Learner", icon: "🥇", earned: false, description: "Reach top 10 on leaderboard", progress: 4, goal: 10 },
];

export const initialLeaderboard: LeaderboardUser[] = [
  { rank: 1, name: "Priya Menon", referralId: "EDU-1A2B3C", points: 4820, emoji: "👑" },
  { rank: 2, name: "Rohan Verma", referralId: "EDU-9Z8Y7X", points: 4390, emoji: "🥈" },
  { rank: 3, name: "Sara Khan", referralId: "EDU-4D5E6F", points: 4105, emoji: "🥉" },
  { rank: 4, name: "Aarav Sharma", referralId: "EDU-7F3K9Q", points: 3980, emoji: "🎓", isCurrentUser: true },
  { rank: 5, name: "Ishaan Gupta", referralId: "EDU-3M2N1P", points: 3750, emoji: "😎" },
  { rank: 6, name: "Neha Joshi", referralId: "EDU-8Q7R6S", points: 3510, emoji: "🌸" },
  { rank: 7, name: "Kabir Malhotra", referralId: "EDU-2K3L4M", points: 3305, emoji: "🚀" },
  { rank: 8, name: "Ananya Iyer", referralId: "EDU-5T6U7V", points: 3120, emoji: "🌟" },
  { rank: 9, name: "Vivaan Rao", referralId: "EDU-0W9X8Y", points: 2980, emoji: "🎯" },
  { rank: 10, name: "Diya Kapoor", referralId: "EDU-6C5B4A", points: 2790, emoji: "🦋" },
];

export const initialCoupons: Coupon[] = [
  {
    id: "c1",
    code: "LEARN10",
    title: "10% Off Any Course",
    description: "Get flat 10% discount on any single course purchase.",
    cost: 100,
    discount: "10% OFF",
    category: "Courses",
    expiry: "Valid till 30 Nov",
    redeemed: false,
    gradient: "from-indigo-500 to-blue-500",
  },
  {
    id: "c2",
    code: "PDF50",
    title: "Flat ₹50 Off PDFs",
    description: "Instant ₹50 off on any PDF / eBook bundle.",
    cost: 60,
    discount: "₹50 OFF",
    category: "PDFs",
    expiry: "Valid till 15 Dec",
    redeemed: false,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    id: "c3",
    code: "PROTRIAL",
    title: "7-Day Pro Trial",
    description: "Unlock Scholar Pro features free for 7 days.",
    cost: 250,
    discount: "FREE TRIAL",
    category: "Membership",
    expiry: "Valid till 31 Dec",
    redeemed: false,
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "c4",
    code: "MEGA25",
    title: "25% Off Mega Bundle",
    description: "Bundle discount across 3 or more courses.",
    cost: 300,
    discount: "25% OFF",
    category: "Courses",
    expiry: "Valid till 10 Jan",
    redeemed: false,
    gradient: "from-rose-500 to-pink-600",
  },
  {
    id: "c5",
    code: "STREAK20",
    title: "Streak Reward Coupon",
    description: "20% off for maintaining a 7-day login streak.",
    cost: 80,
    discount: "20% OFF",
    category: "Special",
    expiry: "Valid till 5 Dec",
    redeemed: false,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    id: "c6",
    code: "CERT15",
    title: "15% Off Certification",
    description: "Discount on any verified certification exam fee.",
    cost: 150,
    discount: "15% OFF",
    category: "Certification",
    expiry: "Valid till 20 Dec",
    redeemed: false,
    gradient: "from-sky-500 to-cyan-500",
  },
];

export const initialNotificationSettings: NotificationSettings = {
  push: true,
  email: true,
  sms: false,
  promotions: true,
};

export const initialPrivacySettings: PrivacySettings = {
  profileVisible: true,
  shareActivity: false,
  personalizedAds: true,
};

export const initialStreak = {
  current: 12,
  longest: 30,
  last7: [true, true, true, false, true, true, true],
  claimedToday: false,
};
