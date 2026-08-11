export interface Course {
  id: string;
  name: string;
  category: string;
  lessons: number;
  image: string;
  rating: number;
  price: number;
}

export const COURSES: Course[] = [
  {
    id: "web-dev",
    name: "Full-Stack Web Development",
    category: "Development",
    lessons: 142,
    rating: 4.9,
    price: 12.99,
    image:
      "https://images.pexels.com/photos/12200696/pexels-photo-12200696.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "ui-ux",
    name: "UI/UX Design Masterclass",
    category: "Design",
    lessons: 98,
    rating: 4.8,
    price: 9.99,
    image:
      "https://images.pexels.com/photos/18311089/pexels-photo-18311089.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "data-science",
    name: "Data Science & Analytics",
    category: "Data",
    lessons: 176,
    rating: 4.9,
    price: 14.99,
    image:
      "https://images.pexels.com/photos/7793173/pexels-photo-7793173.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "marketing",
    name: "Digital Marketing Pro",
    category: "Marketing",
    lessons: 87,
    rating: 4.7,
    price: 7.99,
    image:
      "https://images.pexels.com/photos/17505864/pexels-photo-17505864.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "photography",
    name: "Photography Fundamentals",
    category: "Creative",
    lessons: 64,
    rating: 4.8,
    price: 6.99,
    image:
      "https://images.pexels.com/photos/9660955/pexels-photo-9660955.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "business",
    name: "Business & Finance Essentials",
    category: "Business",
    lessons: 110,
    rating: 4.6,
    price: 10.99,
    image:
      "https://images.pexels.com/photos/16282318/pexels-photo-16282318.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "language",
    name: "Conversational English Speaking",
    category: "Language",
    lessons: 72,
    rating: 4.9,
    price: 8.99,
    image:
      "https://images.pexels.com/photos/7640741/pexels-photo-7640741.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "music",
    name: "Music Production Studio",
    category: "Creative",
    lessons: 59,
    rating: 4.7,
    price: 7.99,
    image:
      "https://images.pexels.com/photos/4167169/pexels-photo-4167169.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  {
    id: "yoga",
    name: "Yoga & Mindful Wellness",
    category: "Health",
    lessons: 45,
    rating: 4.8,
    price: 5.99,
    image:
      "https://images.pexels.com/photos/8436769/pexels-photo-8436769.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
];
