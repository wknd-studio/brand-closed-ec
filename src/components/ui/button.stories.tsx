import type { Meta, StoryObj } from "@storybook/nextjs";
import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: {
    children: "購入する",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Danger: Story = {
  args: { variant: "danger" },
};

export const Disabled: Story = {
  args: { variant: "primary", disabled: true },
};
