export interface Feature {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string; // lucide icon name key
  included: boolean; // true = free with base plan
}

export const FEATURES: Feature[] = [
  {
    id: "offline",
    name: "Offline Downloads",
    description: "Download courses and watch without internet",
    price: 2.99,
    icon: "download",
    included: false,
  },
  {
    id: "certificates",
    name: "Completion Certificates",
    description: "Verified certificates for every completed course",
    price: 3.99,
    icon: "award",
    included: false,
  },
  {
    id: "mentorship",
    name: "Live Mentor Q&A",
    description: "Weekly live sessions with industry mentors",
    price: 5.99,
    icon: "users",
    included: false,
  },
  {
    id: "priority-support",
    name: "Priority Support",
    description: "24/7 priority chat & email support",
    price: 1.99,
    icon: "headphones",
    included: false,
  },
  {
    id: "projects",
    name: "Hands-on Projects",
    description: "Real-world projects with expert feedback",
    price: 4.99,
    icon: "code",
    included: false,
  },
  {
    id: "community",
    name: "Private Community",
    description: "Exclusive access to peer groups & challenges",
    price: 2.49,
    icon: "message-circle",
    included: false,
  },
  {
    id: "analytics",
    name: "Learning Analytics",
    description: "Detailed progress tracking & performance insights",
    price: 1.49,
    icon: "bar-chart-3",
    included: false,
  },
  {
    id: "early-access",
    name: "Early Access Content",
    description: "Get new courses before public release",
    price: 3.49,
    icon: "rocket",
    included: false,
  },
];
