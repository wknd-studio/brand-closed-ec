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
  ],
  preview: {
    select: {
      title: "name",
      media: "logo",
    },
  },
});
