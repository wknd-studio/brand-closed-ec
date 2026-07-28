import { defineField, defineType } from "sanity";

export const brand = defineType({
  name: "brand",
  title: "ブランド",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "ブランド名",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "logo",
      title: "ロゴ画像",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "description",
      title: "ブランド説明",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "design_theme",
      title: "デザインテーマ",
      description:
        "未設定の場合はデフォルトの見た目（配色・フォント・バナーなし）になります",
      type: "reference",
      to: [{ type: "designTheme" }],
    }),
    defineField({
      name: "price_settings",
      title: "掛け率設定",
      description:
        "このブランドの商品にデフォルトで適用される掛け率設定。商品ごとに個別の掛け率設定で上書き可能",
      type: "reference",
      to: [{ type: "priceSettings" }],
    }),
  ],
  preview: {
    select: {
      title: "name",
      media: "logo",
    },
  },
});
