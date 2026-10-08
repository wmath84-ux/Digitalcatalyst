import type { Banner, Category } from "../types";

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
