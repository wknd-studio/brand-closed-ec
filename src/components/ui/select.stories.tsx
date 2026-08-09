import type { Meta, StoryObj } from "@storybook/nextjs";
import { Select } from "./select";

const meta = {
  title: "UI/Select",
  component: Select,
  args: {
    name: "prefecture",
    options: [
      { value: "tokyo", label: "東京都" },
      { value: "osaka", label: "大阪府" },
      { value: "fukuoka", label: "福岡県" },
    ],
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const ErrorState: Story = {
  args: { error: "都道府県を選択してください" },
};
