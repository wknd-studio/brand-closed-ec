import type { Meta, StoryObj } from "@storybook/nextjs";
import { Container } from "./container";

const meta = {
  title: "UI/Container",
  component: Container,
  args: {
    children: (
      <div className="bg-neutral-100 py-4 text-center text-sm">
        max-w-[1080px] + レスポンシブpadding
      </div>
    ),
  },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
