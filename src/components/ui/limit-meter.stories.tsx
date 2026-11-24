import type { Meta, StoryObj } from "@storybook/nextjs";
import { monthlyLimitStatus } from "@/domain/services/cart-limit";
import { LimitMeter } from "./limit-meter";

// 金額と、画面と同じく cart-limit の monthlyLimitStatus で求めた状態
function meter(
  monthlyLimit: number | null,
  confirmedAmount: number,
  cartAmount: number
) {
  return {
    monthlyLimit,
    confirmedAmount,
    cartAmount,
    status: monthlyLimitStatus({
      lines: [{ productId: "p", unitPrice: cartAmount, quantity: 1 }],
      confirmedAmount,
      monthlyLimit,
    }),
  };
}

const meta = {
  title: "UI/LimitMeter",
  component: LimitMeter,
  args: meter(5_000_000, 1_090_500, 149_500),
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
  args: meter(5_000_000, 4_470_500, 149_500),
};

export const Unlimited: Story = {
  args: meter(null, 1_090_500, 149_500),
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
