import type { Meta, StoryObj } from "@storybook/nextjs";
import { Card } from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  args: {
    className: "p-6 w-64",
    children: "カードの中身",
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Featured: Story = {
  args: { featured: true },
};
