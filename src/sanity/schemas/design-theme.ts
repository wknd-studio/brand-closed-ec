import { defineField, defineType } from "sanity";

import { FONT_OPTIONS } from "./design-theme-fonts";

export const designTheme = defineType({
  name: "designTheme",
  title: "デザインテーマ",
  type: "document",
  description:
    "ブランドページの配色・フォント・バナーをまとめて切り替えるテーマ。複数ブランドから参照可能",
  fields: [
    defineField({
      name: "name",
      title: "テーマ名",
      description: "Studio上で識別するための名前（会員には表示されません）",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "primary_color",
      title: "プライマリカラー",
      type: "color",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "accent_color",
      title: "アクセントカラー",
      type: "color",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "font",
      title: "フォント",
      type: "string",
      options: { list: [...FONT_OPTIONS] },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "banner",
      title: "バナー画像",
      description: "ブランドページ上部に表示するヒーロー画像",
      type: "image",
      options: { hotspot: true },
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: {
      title: "name",
      media: "banner",
    },
  },
});
