import type { Meta, StoryObj } from "@storybook/nextjs";
import { Breadcrumb } from "./breadcrumb";

const meta = {
  title: "UI/Breadcrumb",
  component: Breadcrumb,
  args: {
    items: [
      { label: "ショップ", href: "/shop" },
      { label: "Brand A", href: "/brands/brand-a" },
      { label: "レザートートバッグ" },
    ],
  },
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Product: Story = {};

export const Brand: Story = {
  args: {
    items: [{ label: "ショップ", href: "/shop" }, { label: "Brand A" }],
  },
};
