import type { Meta, StoryObj } from "@storybook/nextjs";
import { Section } from "./section";

const meta = {
  title: "UI/Section",
  component: Section,
  args: {
    children: (
      <div className="bg-neutral-100 py-4 text-center text-sm">Section本文</div>
    ),
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
