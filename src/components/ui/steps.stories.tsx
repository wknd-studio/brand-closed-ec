import type { Meta, StoryObj } from "@storybook/nextjs";
import { Steps } from "./steps";

const meta = {
  title: "UI/Steps",
  component: Steps,
  args: {
    steps: ["ご利用の種別", "プラン・お客様情報", "お支払い"],
    current: 0,
  },
} satisfies Meta<typeof Steps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const First: Story = {};

export const Middle: Story = {
  args: { current: 1 },
};

export const Last: Story = {
  args: { current: 2 },
};
