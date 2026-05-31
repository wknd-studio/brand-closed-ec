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
  ],
  preview: {
    select: {
      title: "name",
      media: "logo",
    },
  },
});
