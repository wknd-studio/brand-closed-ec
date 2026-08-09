import type { Meta, StoryObj } from "@storybook/nextjs";
import { Heading } from "./heading";

const meta = {
  title: "UI/Heading",
  component: Heading,
  args: {
    children: "招待制のプライベートEC",
  },
} satisfies Meta<typeof Heading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Display: Story = {
  args: { level: "display", as: "h1" },
};

export const Section: Story = {
  args: { level: "section", as: "h2", children: "会員になるメリット" },
};
