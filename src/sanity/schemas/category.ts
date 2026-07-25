import { defineField, defineType } from "sanity";

export const category = defineType({
  name: "category",
  title: "カテゴリ",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "カテゴリ名",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "icon",
      title: "アイコン画像",
      type: "image",
      options: { hotspot: true },
    }),
  ],
  preview: {
    select: { title: "name", media: "icon" },
  },
});
