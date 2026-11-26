import {
  Cormorant,
  Geist,
  Geist_Mono,
  Inter,
  Playfair_Display,
} from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const brandSansFont = Inter({
  variable: "--font-brand-sans",
  subsets: ["latin"],
  display: "swap",
});

export const brandSerifFont = Playfair_Display({
  variable: "--font-brand-serif",
  subsets: ["latin"],
  display: "swap",
});

export const brandElegantFont = Cormorant({
  variable: "--font-brand-elegant",
  subsets: ["latin"],
  display: "swap",
});

export const BRAND_FONT_VARIABLES = [
  brandSansFont.variable,
  brandSerifFont.variable,
  brandElegantFont.variable,
].join(" ");

// <html> に付けるフォントの変数。全体のエラー画面（global-error.tsx）はルートのレイアウトの外で描かれるため、
// 同じ値を両方で付ける
export const ROOT_FONT_CLASS_NAMES = [
  geistSans.variable,
  geistMono.variable,
  BRAND_FONT_VARIABLES,
].join(" ");
