import { Cormorant, Inter, Playfair_Display } from "next/font/google";

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
