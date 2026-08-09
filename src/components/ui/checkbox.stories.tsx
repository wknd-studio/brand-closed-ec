import type { Meta, StoryObj } from "@storybook/nextjs";
import { Checkbox } from "./checkbox";

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  args: {
    name: "agree",
    label: "利用規約に同意する",
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};
