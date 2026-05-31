export type CartItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number | null; // null = 要相談
};

export type Cart = {
  items: CartItem[];
};
