import { defineField, defineType } from "sanity";

export const announcement = defineType({
  name: "announcement",
  title: "お知らせ",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "タイトル",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "body",
      title: "本文",
      type: "array",
      of: [{ type: "block" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "published_at",
      title: "公開日時",
      type: "datetime",
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "published_at",
    },
  },
});
