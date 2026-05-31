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
  ],
  preview: {
    select: { title: "name" },
  },
});
