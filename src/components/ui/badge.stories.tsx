import type { Meta, StoryObj } from "@storybook/nextjs";
import { Badge } from "./badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: {
    children: "後払い",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

export const Primary: Story = {
  args: { tone: "primary", children: "注文時払い" },
};

export const Success: Story = {
  args: { tone: "success", children: "入金確認済み" },
};

export const Warning: Story = {
  args: { tone: "warning", children: "対応中" },
};

export const Danger: Story = {
  args: { tone: "danger", children: "上限超過" },
};

export const Info: Story = {
  args: { tone: "info", children: "請求書払い" },
};
