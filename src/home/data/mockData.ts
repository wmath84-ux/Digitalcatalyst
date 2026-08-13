import type { Banner, Category, Review } from "../types";

export const categories: Category[] = [
  { id: "all", label: "All", icon: "✨" },
  { id: "video", label: "Video Lectures", icon: "🎬" },
  { id: "pdf", label: "PDFs", icon: "📄" },
  { id: "ebook", label: "E-books", icon: "📚" },
  { id: "live", label: "Live Classes", icon: "🔴" },
];

export const banners: Banner[] = [
  {
    id: "b1",
    image: "/images/hero-1.jpg",
    eyebrow: "NEW ARRIVAL",
    title: "Master Data Science 2.0",
    subtitle: "Fresh video course by top mentors, launching this week",
    cta: "Explore Now",
    gradient: "from-violet-600 via-fuchsia-500 to-pink-500",
  },
  {
    id: "b2",
    image: "/images/hero-2.jpg",
    eyebrow: "MEGA SALE",
    title: "Flat 60% Off Sitewide",
    subtitle: "Grab your favourite courses before the timer runs out",
    cta: "Grab Deal",
    gradient: "from-orange-500 via-rose-500 to-red-500",
  },
  {
    id: "b3",
    image: "/images/hero-3.jpg",
    eyebrow: "GOING LIVE",
    title: "Live Doubt Class Tonight",
    subtitle: "Join 12,000+ learners for a free live problem-solving session",
    cta: "Reserve Seat",
    gradient: "from-cyan-500 via-sky-500 to-blue-600",
  },
];

export const reviews: Review[] = [
  {
    id: "r1",
    name: "Ananya Verma",
    avatarColor: "bg-pink-500",
    initials: "AV",
    rating: 5,
    date: "2 days ago",
    comment:
      "The video lectures are crystal clear and the daily study plan keeps me motivated to finish every module!",
    course: "Complete Physics Mastery",
  },
  {
    id: "r2",
    name: "Rohit Malhotra",
    avatarColor: "bg-indigo-500",
    initials: "RM",
    rating: 5,
    date: "1 week ago",
    comment:
      "Bought the PDF notes before my exam and honestly they were more helpful than my coaching material. Super concise!",
    course: "Quick Revision Notes",
  },
  {
    id: "r3",
    name: "Sneha Kapoor",
    avatarColor: "bg-emerald-500",
    initials: "SK",
    rating: 4,
    date: "3 weeks ago",
    comment:
      "Live classes feel just like an actual classroom. The instructor answered every single doubt patiently.",
    course: "Live Vedic Maths Bootcamp",
  },
  {
    id: "r4",
    name: "Karan Mehta",
    avatarColor: "bg-orange-500",
    initials: "KM",
    rating: 5,
    date: "1 month ago",
    comment:
      "The app UI is so smooth, swiping through the banners and finding new courses feels genuinely premium.",
    course: "Python for Beginners",
  },
  {
    id: "r5",
    name: "Priya Nair",
    avatarColor: "bg-sky-500",
    initials: "PN",
    rating: 5,
    date: "2 months ago",
    comment:
      "Loved the e-book formatting and the ability to resume right where I left off. Highly recommend this app!",
    course: "Design Thinking Handbook",
  },
];
