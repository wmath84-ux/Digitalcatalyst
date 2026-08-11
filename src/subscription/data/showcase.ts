export interface ShowcaseCard {
  id: string;
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}

export const SHOWCASE_CARDS: ShowcaseCard[] = [
  {
    id: "s1",
    image: "/images/showcase-1.jpg",
    eyebrow: "PREMIUM ACCESS",
    title: "Unlock Everything",
    subtitle: "One plan for every course, every feature, forever updated.",
  },
  {
    id: "s2",
    image: "/images/showcase-2.jpg",
    eyebrow: "500+ COURSES",
    title: "Learn Without Limits",
    subtitle: "From beginner to expert, taught by industry professionals.",
  },
  {
    id: "s3",
    image: "/images/showcase-3.jpg",
    eyebrow: "FAST TRACK",
    title: "Accelerate Your Growth",
    subtitle: "Downloadable resources and offline mode included.",
  },
  {
    id: "s4",
    image: "/images/showcase-4.jpg",
    eyebrow: "COMMUNITY",
    title: "Join 2M+ Learners",
    subtitle: "Live mentorship, peer groups, and weekly challenges.",
  },
];
