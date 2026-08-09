import type { Meta, StoryObj } from "@storybook/nextjs";
import { Radio } from "./radio";

const meta = {
  title: "UI/Radio",
  component: Radio,
  args: {
    name: "shipping",
    value: "standard",
    label: "通常配送",
  },
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};
