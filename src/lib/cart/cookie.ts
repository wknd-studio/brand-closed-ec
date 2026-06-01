import type { Cart, CartItem } from "./types";

export const COOKIE_NAME = "cart";
const MAX_AGE = 60 * 60 * 24 * 90; // 90日

export function parseCart(raw: string | undefined): Cart {
  if (!raw) return { items: [] };
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed as Cart;
  } catch {
    return { items: [] };
  }
}

export function serializeCart(cart: Cart): string {
  return encodeURIComponent(JSON.stringify(cart));
}

export function readCart(): Cart {
  if (typeof document === "undefined") return { items: [] };
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  return parseCart(match?.split("=").slice(1).join("="));
}

export function writeCart(cart: Cart): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${serializeCart(cart)}; max-age=${MAX_AGE}; path=/; SameSite=Lax`;
}

export function addItem(
  cart: Cart,
  item: Omit<CartItem, "quantity">,
  quantity = 1
): Cart {
  const existing = cart.items.find((i) => i.productId === item.productId);
  if (existing) {
    return {
      items: cart.items.map((i) =>
        i.productId === item.productId
          ? { ...i, quantity: i.quantity + quantity }
          : i
      ),
    };
  }
  return { items: [...cart.items, { ...item, quantity }] };
}

export function updateQuantity(
  cart: Cart,
  productId: string,
  quantity: number
): Cart {
  if (quantity <= 0) return removeItem(cart, productId);
  return {
    items: cart.items.map((i) =>
      i.productId === productId ? { ...i, quantity } : i
    ),
  };
}

export function removeItem(cart: Cart, productId: string): Cart {
  return { items: cart.items.filter((i) => i.productId !== productId) };
}

export function clearCart(): Cart {
  return { items: [] };
}

export function calcCartFixedTotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => {
    if (item.unitPrice === null) return sum;
    return sum + item.unitPrice * item.quantity;
  }, 0);
}

export function calcItemUpdateError({
  cart,
  productId,
  newQuantity,
  confirmedAmount,
  monthlyLimit,
}: {
  cart: Cart;
  productId: string;
  newQuantity: number;
  confirmedAmount: number;
  monthlyLimit: number;
}): string | undefined {
  if (monthlyLimit === 0) return undefined;
  const item = cart.items.find((i) => i.productId === productId);
  if (!item || item.unitPrice === null) return undefined;
  if (newQuantity <= item.quantity) return undefined;
  const othersTotal = cart.items.reduce((sum, i) => {
    if (i.productId === productId || i.unitPrice === null) return sum;
    return sum + i.unitPrice * i.quantity;
  }, 0);
  if (
    confirmedAmount + othersTotal + item.unitPrice * newQuantity >
    monthlyLimit
  ) {
    return `月間仕入れ上限（¥${monthlyLimit.toLocaleString()}）を超えるため変更できません`;
  }
  return undefined;
}
