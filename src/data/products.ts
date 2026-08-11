export type Product = {
  id: string;
  title: string;
  instructor: string;
  image: string;
  category: "Notes" | "Course" | "PDF";
  classLevel: string;
  subject: string;
  tags: string[];
  rating: number;
  reviews: number;
  originalPrice: number;
  price: number;
};

export const products: Product[] = [
  {
    id: "real-numbers",
    title: "Notes, For Class - 10th Real Number",
    instructor: "Physics Master",
    image: "/images/real-numbers.jpg",
    category: "Notes",
    classLevel: "Class 10th",
    subject: "Real Numbers",
    tags: ["SALE", "BOARD"],
    rating: 3.2,
    reviews: 2,
    originalPrice: 99,
    price: 0,
  },
  {
    id: "trigonometry",
    title: "Trigonometry Crash Course - Class 10th",
    instructor: "Physics Master",
    image: "/images/trigonometry.jpg",
    category: "Course",
    classLevel: "Class 10th",
    subject: "Math",
    tags: ["BOARD"],
    rating: 4.4,
    reviews: 18,
    originalPrice: 249,
    price: 149,
  },
  {
    id: "chemical-reactions",
    title: "Chemical Reactions - Full Chapter Notes",
    instructor: "Chem Guru",
    image: "/images/chemical-reactions.jpg",
    category: "Notes",
    classLevel: "Class 10th",
    subject: "Science",
    tags: ["SALE"],
    rating: 4.1,
    reviews: 9,
    originalPrice: 129,
    price: 49,
  },
  {
    id: "english-grammar",
    title: "English Grammar Master Class",
    instructor: "Word Wizard",
    image: "/images/english-grammar.jpg",
    category: "Course",
    classLevel: "Class 9th",
    subject: "English",
    tags: [],
    rating: 4.7,
    reviews: 34,
    originalPrice: 199,
    price: 199,
  },
  {
    id: "mechanics",
    title: "Mechanics One Shot - Class 11th Physics",
    instructor: "Physics Master",
    image: "/images/mechanics.jpg",
    category: "Course",
    classLevel: "Class 11th",
    subject: "Physics",
    tags: ["SALE", "BOARD"],
    rating: 4.6,
    reviews: 52,
    originalPrice: 349,
    price: 199,
  },
  {
    id: "real-numbers-pdf",
    title: "Real Numbers - Formula Sheet PDF",
    instructor: "Physics Master",
    image: "/images/real-numbers.jpg",
    category: "PDF",
    classLevel: "Class 10th",
    subject: "Real Numbers",
    tags: ["BOARD"],
    rating: 3.9,
    reviews: 5,
    originalPrice: 49,
    price: 0,
  },
];
