export interface EduUser {
  name: string;
  email: string;
  phone: string;
  bio: string;
  initials: string;
  referralId: string;
  joinDate: string;
}

export interface CoinTransaction {
  id: string;
  type: "earn" | "spend";
  amount: number;
  reason: string;
  date: string;
}

export type PlanId = "basic" | "pro" | "elite";

export interface MembershipPlan {
  id: PlanId;
  name: string;
  price: string;
  tagline: string;
  perks: string[];
  color: string;
}

export interface Membership {
  planId: PlanId;
  renewalDate: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  type: "Course" | "PDF" | "Ebook";
  emoji: string;
  progress?: number;
  size?: string;
}

export interface DownloadItem {
  id: string;
  title: string;
  size: string;
  type: string;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  earned: boolean;
  description: string;
  progress: number;
  goal: number;
}

export interface LeaderboardUser {
  rank: number;
  name: string;
  referralId: string;
  points: number;
  emoji: string;
  isCurrentUser?: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  cost: number;
  discount: string;
  category: string;
  expiry: string;
  redeemed: boolean;
  gradient: string;
}

export interface NotificationSettings {
  push: boolean;
  email: boolean;
  sms: boolean;
  promotions: boolean;
}

export interface PrivacySettings {
  profileVisible: boolean;
  shareActivity: boolean;
  personalizedAds: boolean;
}

export type TabId = "profile" | "coupons" | "leaderboard" | "rewards";
