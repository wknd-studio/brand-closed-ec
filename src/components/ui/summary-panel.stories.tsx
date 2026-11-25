import type { Meta, StoryObj } from "@storybook/nextjs";
import { Button } from "./button";
import { SummaryList, SummaryPanel, SummaryRow } from "./summary-panel";

const meta = {
  title: "UI/SummaryPanel",
  component: SummaryPanel,
  args: { "aria-label": "お支払い金額" },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SummaryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ご注文内容の確認（/order/checkout）の金額のまとめ
export const Checkout: Story = {
  render: (args) => (
    <SummaryPanel {...args}>
      <SummaryList>
        <SummaryRow label="クレジットカード（注文時）">¥78,000</SummaryRow>
        <SummaryRow label="請求書（注文後に請求）">¥71,500</SummaryRow>
        <SummaryRow label="価格要相談">1点（後日ご連絡）</SummaryRow>
        <SummaryRow label="合計" variant="total">
          ¥149,500
        </SummaryRow>
      </SummaryList>
      <Button className="w-full">注文を確定する</Button>
    </SummaryPanel>
  ),
};

// プランとお客様情報（/onboarding/plan）の申込内容のまとめ
export const Plan: Story = {
  args: { "aria-label": "お申し込み内容" },
  render: (args) => (
    <SummaryPanel {...args}>
      <SummaryList>
        <SummaryRow label="初期費用">¥33,000</SummaryRow>
        <SummaryRow label="初月の月額">¥11,000</SummaryRow>
        <SummaryRow label="本日のお支払い" variant="total">
          ¥44,000
        </SummaryRow>
        <SummaryRow label="2ヶ月目以降" variant="note">
          毎月 ¥11,000
        </SummaryRow>
      </SummaryList>
      <Button className="w-full">お支払いへ進む</Button>
    </SummaryPanel>
  ),
};
