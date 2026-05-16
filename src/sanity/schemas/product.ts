import { defineField, defineType } from "sanity";

const RANK_OPTIONS = [
  { title: "Free", value: "free" },
  { title: "Entry", value: "entry" },
  { title: "Standard", value: "standard" },
  { title: "Pro", value: "pro" },
  { title: "Enterprise", value: "enterprise" },
];

export const product = defineType({
  name: "product",
  title: "商品",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "商品名",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "brand",
      title: "ブランド名",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "categories",
      title: "カテゴリ",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "description",
      title: "説明",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "images",
      title: "商品画像",
      type: "array",
      of: [
        {
          type: "image",
          options: { hotspot: true },
        },
      ],
    }),
    defineField({
      name: "files",
      title: "添付ファイル（スペックシート・仕様書 PDF 等）",
      type: "array",
      of: [
        {
          type: "file",
          fields: [
            defineField({
              name: "label",
              title: "ファイル名（表示用）",
              type: "string",
            }),
          ],
        },
      ],
    }),
    defineField({
      name: "prices",
      title: "ランク別価格（円）",
      type: "object",
      fields: [
        defineField({ name: "free", title: "Free", type: "number" }),
        defineField({ name: "entry", title: "Entry", type: "number" }),
        defineField({ name: "standard", title: "Standard", type: "number" }),
        defineField({ name: "pro", title: "Pro", type: "number" }),
        defineField({
          name: "enterprise",
          title: "Enterprise",
          type: "number",
        }),
      ],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "min_rank",
      title: "最低閲覧ランク",
      description: "このランク未満の会員には商品が表示されません",
      type: "string",
      options: { list: RANK_OPTIONS },
      initialValue: "free",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "availability",
      title: "在庫状況",
      type: "string",
      options: {
        list: [
          { title: "取り扱い中", value: "available" },
          { title: "在庫切れ", value: "out_of_stock" },
          { title: "取り扱い終了", value: "discontinued" },
        ],
      },
      initialValue: "available",
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "brand",
      media: "images.0",
    },
  },
});
