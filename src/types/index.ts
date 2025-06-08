export interface User {
  id: string;
  email: string;
  inGameAlias: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  priceId: string;
  image?: string;
  active: boolean;
  phrase?: string;
  customizable?: boolean;
  kofi_direct_link_code?: string; // Ko-fi shop item direct link code
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  status: 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid';
  priceId: string;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface Avatar {
  id: string;
  url: string;
  name: string;
  isDefault: boolean;
}

export interface UserProduct {
  id: string;
  user_id: string;
  product_id: string;
  phrase?: string;
  created_at: string;
  products?: Product;
} 