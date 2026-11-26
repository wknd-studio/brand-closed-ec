import type { Meta, StoryObj } from "@storybook/nextjs";
import { useState, type ComponentProps } from "react";
import { QuantityStepper } from "./quantity-stepper";

function Stateful(props: ComponentProps<typeof QuantityStepper>) {
  const [value, setValue] = useState(props.value);
  return <QuantityStepper {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "UI/QuantityStepper",
  component: QuantityStepper,
  render: (args) => <Stateful {...args} />,
  args: {
    label: "数量",
    value: 1,
    onChange: () => {},
  },
} satisfies Meta<typeof QuantityStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

// 商品詳細（「カートに追加」の Button と同じ高さ）
export const ProductDetail: Story = {};

// カートの各行
export const Cart: Story = {
  args: { size: "sm", label: "レザートートバッグの数量", value: 4 },
};

export const Disabled: Story = {
  args: { value: 3, disabled: true },
};

// 在庫切れの商品（増やせないが減らせる）
export const AtMax: Story = {
  args: { size: "sm", value: 2, max: 2 },
};
