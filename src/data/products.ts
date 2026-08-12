export type Product = {
  id: string;
  title: string;
  instructor: string;
  image: string;
  category: "Notes" | "Course" | "PDF" | "E-book" | "Live";
  classLevel: string;
  subject: string;
  tags: string[];
  rating: number;
  reviews: number;
  originalPrice: number;
  price: number;
  description?: string;
  paymentLink?: string;
};
