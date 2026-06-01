export type CartItem = {
  productId: string;
  productName: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number | null; // null = 要相談
  availability: "available" | "out_of_stock" | "discontinued";
};

export type Cart = {
  items: CartItem[];
};
