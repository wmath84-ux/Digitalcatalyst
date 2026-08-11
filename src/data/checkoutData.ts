// Mock data for the checkout flow

export interface Product {
  id: string;
  name: string;
  type: 'PDF' | 'Course' | 'Video' | 'eBook' | 'Live Workshop';
  description: string;
  price: number; // in INR
  currency: string;
  thumbnail: string; // emoji placeholder
  instructor: string;
  duration: string;
  rating: number;
  totalRatings: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarEmoji: string;
  eduCoins: number; // 1 EduCoin = ₹1 discount
  maxEduCoinsUsable: number; // max % of price payable via EduCoins
}

export interface TransactionResult {
  transactionId: string;
  orderId: string;
  paymentMethod: string;
  timestamp: string;
  status: 'success' | 'failed';
}

export const product: Product = {
  id: 'PROD-2024-0891',
  name: 'Complete React & Next.js Mastery',
  type: 'Course',
  description:
    'Master React 19, Next.js 15, TypeScript, Server Components, and build 5 real-world production projects from scratch.',
  price: 1499,
  currency: '₹',
  thumbnail: '📘',
  instructor: 'Aman Sharma',
  duration: '42 hours',
  rating: 4.8,
  totalRatings: 12450,
};

export const user: UserProfile = {
  id: 'USR-78234',
  name: 'Rahul Verma',
  email: 'rahul.verma@gmail.com',
  phone: '+91 98765 43210',
  avatarEmoji: '👨‍🎓',
  eduCoins: 250,
  maxEduCoinsUsable: 30, // max 30% of price
};

export function generateTransactionResult(): TransactionResult {
  const txnId = 'TXN' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const methods = ['UPI - Google Pay', 'UPI - PhonePe', 'Credit Card ****4242', 'Debit Card ****1881', 'Net Banking - SBI'];
  return {
    transactionId: txnId,
    orderId,
    paymentMethod: methods[Math.floor(Math.random() * methods.length)],
    timestamp: new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    status: 'success',
  };
}
