import type { Meta, StoryObj } from "@storybook/nextjs";
import { SectionHeader } from "./section-header";

const meta = {
  title: "UI/SectionHeader",
  component: SectionHeader,
  args: {
    eyebrow: "HOW IT WORKS",
    heading: "月額プランで、卸価格の仕入れが可能に",
    description:
      "月額費用を支払うことで、会員限定ブランドの商品を定価より安い卸価格で購入できます。",
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutDescription: Story = {
  args: { description: undefined },
};
