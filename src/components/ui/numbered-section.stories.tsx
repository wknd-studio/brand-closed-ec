import type { Meta, StoryObj } from "@storybook/nextjs";
import { NumberedSection } from "./numbered-section";

const meta = {
  title: "UI/NumberedSection",
  component: NumberedSection,
  args: {
    id: "story-numbered-section",
    number: 1,
    title: "お届け先・請求先",
    children: (
      <p className="text-sm text-neutral-700">
        区切りの中身（住所の選択・入力欄など）を置きます。
      </p>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NumberedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
