import type { Meta, StoryObj } from "@storybook/nextjs";
import { ChoiceCard } from "./choice-card";

const meta = {
  title: "UI/ChoiceCard",
  component: ChoiceCard,
} satisfies Meta<typeof ChoiceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Group: Story = {
  render: () => (
    <fieldset className="grid max-w-xl gap-3.5 sm:grid-cols-2">
      <legend className="sr-only">ご利用の種別</legend>
      {[
        { value: "individual", title: "個人として登録" },
        { value: "corporate", title: "法人として登録" },
      ].map((choice, index) => (
        <ChoiceCard key={choice.value} className="gap-3 p-[22px]">
          <span className="flex items-start justify-between">
            <span className="font-display text-[19px] font-semibold">
              {choice.title}
            </span>
            <input
              type="radio"
              name="story-account-type"
              value={choice.value}
              defaultChecked={index === 0}
              className="m-0 h-5 w-5 accent-primary focus-visible:outline-none"
            />
          </span>
          <span className="text-[13px] text-neutral-700">
            カードのどこを押しても選べます
          </span>
        </ChoiceCard>
      ))}
    </fieldset>
  ),
};
