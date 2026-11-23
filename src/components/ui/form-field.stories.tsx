import type { Meta, StoryObj } from "@storybook/nextjs";
import { FormField } from "./form-field";
import { Input } from "./input";
import { Select } from "./select";

const meta = {
  title: "UI/FormField",
  component: FormField,
  args: {
    label: "電話番号",
    children: (field) => (
      <Input
        type="tel"
        name="phoneNumber"
        placeholder="09012345678"
        className="w-full"
        {...field}
      />
    ),
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ErrorState: Story = {
  args: { error: "0から始まる10〜11桁の数字で入力してください" },
};

export const WithSelect: Story = {
  args: {
    label: "都道府県",
    error: "都道府県を入力してください",
    children: (field) => (
      <Select
        name="prefecture"
        className="w-full"
        options={[
          { value: "", label: "選択してください" },
          { value: "東京都", label: "東京都" },
        ]}
        {...field}
      />
    ),
  },
};
