"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  writeCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  calcCartFixedTotal,
} from "./cookie";
import type { Cart, CartItem } from "./types";

type CartContextValue = {
  cart: Cart;
  confirmedAmount: number;
  monthlyLimit: number;
  totalUsed: number;
  addToCart: (
    item: Omit<CartItem, "quantity">,
    quantity?: number
  ) => { error?: string };
  updateItemQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  emptyCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

type Props = {
  children: ReactNode;
  confirmedAmount: number;
  monthlyLimit: number;
  initialCart: Cart;
};

export function CartProvider({
  children,
  confirmedAmount,
  monthlyLimit,
  initialCart,
}: Props) {
  const [cart, setCart] = useState<Cart>(initialCart);

  const updateCart = useCallback((next: Cart) => {
    setCart(next);
    writeCart(next);
  }, []);

  const addToCart = useCallback(
    (item: Omit<CartItem, "quantity">, quantity = 1): { error?: string } => {
      if (item.unitPrice !== null) {
        const cartTotal = calcCartFixedTotal(cart);
        if (
          confirmedAmount + cartTotal + item.unitPrice * quantity >
          monthlyLimit
        ) {
          return {
            error: `月間仕入れ上限（¥${monthlyLimit.toLocaleString()}）を超えるため追加できません`,
          };
        }
      }
      updateCart(addItem(cart, item, quantity));
      return {};
    },
    [cart, confirmedAmount, monthlyLimit, updateCart]
  );

  const updateItemQuantity = useCallback(
    (productId: string, quantity: number) => {
      updateCart(updateQuantity(cart, productId, quantity));
    },
    [cart, updateCart]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      updateCart(removeItem(cart, productId));
    },
    [cart, updateCart]
  );

  const emptyCart = useCallback(() => {
    updateCart(clearCart());
  }, [updateCart]);

  const totalUsed = confirmedAmount + calcCartFixedTotal(cart);

  return (
    <CartContext.Provider
      value={{
        cart,
        confirmedAmount,
        monthlyLimit,
        totalUsed,
        addToCart,
        updateItemQuantity,
        removeFromCart,
        emptyCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
