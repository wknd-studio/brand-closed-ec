import type { Meta, StoryObj } from "@storybook/nextjs";
import { FeatureGrid } from "./feature-grid";

const meta = {
  title: "UI/FeatureGrid",
  component: FeatureGrid,
} satisfies Meta<typeof FeatureGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSteps: Story = {
  args: {
    columns: 3,
    items: [
      {
        badge: "01",
        title: "月額プランに加入",
        description: "ご希望のプランを選んで登録します。",
      },
      {
        badge: "02",
        title: "定価より安く購入",
        description: "対象商品を卸価格で購入できます。",
      },
      {
        badge: "03",
        title: "上限額まで何度でも",
        description: "月間仕入れ上限に達するまで注文できます。",
      },
    ],
  },
};

export const Dense: Story = {
  args: {
    columns: 2,
    dense: true,
    items: [
      {
        title: "最大50%OFF",
        description: "対象商品を定価から最大50%OFFで購入できます。",
      },
      {
        title: "正規取扱店で安心",
        description: "すべて正規ルートで仕入れた商品のみを取り扱っています。",
      },
    ],
  },
};
