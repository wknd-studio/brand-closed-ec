export type CartItem = {
  productId: string;
  productName: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number | null; // null = 要相談
};

export type Cart = {
  items: CartItem[];
};
