export interface Product {
  id: string;
  title: string;
  author: string;
  category: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewsCount: number;
  image: string;
  hours: string;
  lessons: number;
  bestseller?: boolean;
}

export type TabKey = "home" | "favorites" | "cart";
