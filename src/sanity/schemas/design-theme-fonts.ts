export const FONT_OPTIONS = [
  { title: "モダンサンセリフ（Inter）", value: "sans" },
  { title: "クラシックセリフ（Playfair Display）", value: "serif" },
  { title: "エレガント（Cormorant）", value: "elegant" },
] as const;

export type FontKey = (typeof FONT_OPTIONS)[number]["value"];
