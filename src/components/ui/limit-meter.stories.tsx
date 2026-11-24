import type { Meta, StoryObj } from "@storybook/nextjs";
import { LimitMeter } from "./limit-meter";

const meta = {
  title: "UI/LimitMeter",
  component: LimitMeter,
  args: {
    monthlyLimit: 5_000_000,
    confirmedAmount: 1_090_500,
    cartAmount: 149_500,
    remaining: 3_760_000,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LimitMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {};

export const NearLimit: Story = {
  args: { confirmedAmount: 4_470_500, cartAmount: 149_500, remaining: 380_000 },
};

export const Unlimited: Story = {
  args: { monthlyLimit: null, remaining: null },
};

export const WithCartBreakdown: Story = {
  args: { cartBreakdown: true },
};

export const Detail: Story = {
  args: { variant: "detail", planName: "スタンダード" },
  decorators: [
    (Story) => (
      <div style={{ width: 310 }}>
        <Story />
      </div>
    ),
  ],
};
