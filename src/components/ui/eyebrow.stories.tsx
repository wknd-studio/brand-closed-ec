import type { Meta, StoryObj } from "@storybook/nextjs";
import { Eyebrow } from "./eyebrow";

const meta = {
  title: "UI/Eyebrow",
  component: Eyebrow,
  args: {
    children: "INVITATION ONLY",
  },
} satisfies Meta<typeof Eyebrow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
