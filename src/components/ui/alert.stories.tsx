import type { Meta, StoryObj } from "@storybook/nextjs";
import { Alert } from "./alert";

const meta = {
  title: "UI/Alert",
  component: Alert,
  args: {
    tone: "success",
    role: "status",
    children: "カートに追加しました",
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    action: (
      <a href="#" className="underline">
        カートを見る
      </a>
    ),
  },
};

export const Danger: Story = {
  args: {
    tone: "danger",
    role: "alert",
    title: "月間仕入れ上限（¥5,000,000）を超えるため追加できません。",
    children: (
      <p className="text-[0.8125rem]">
        今月の残りは ¥380,000 です。数量を減らすか、来月にご注文ください。
      </p>
    ),
  },
};

export const Warning: Story = {
  args: {
    tone: "warning",
    children: "今月の仕入れ枠の残りが少なくなっています。",
  },
};

export const Info: Story = {
  args: {
    tone: "info",
    children:
      "運営者が内容を確認したあと、請求書をお送りします。発行日から7日以内にお支払いください。",
  },
};

export const Neutral: Story = {
  args: {
    tone: "neutral",
    children: "価格要相談の商品は、合計に含まれません。",
  },
};
