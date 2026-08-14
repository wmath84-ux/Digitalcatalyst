export type ProductType = "video" | "pdf" | "ebook" | "live";

export interface Product {
  id: string;
  title: string;
  type: ProductType;
  category: string;
  author: string;
  price: number;
  mrp: number;
  rating: number;
  ratingCount: number;
  image: string;
  searchKeywords?: string[];
  trending?: boolean;
}

export interface Category {
  id: string;
  label: string;
  icon: string;
}

export interface Banner {
  id: string;
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  gradient: string;
}

export interface Review {
  id: string;
  name: string;
  avatarColor: string;
  initials: string;
  rating: number;
  date: string;
  comment: string;
  course: string;
}
