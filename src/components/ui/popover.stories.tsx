import type { Meta, StoryObj } from "@storybook/nextjs";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta = {
  title: "UI/Popover",
  component: Popover,
  render: () => (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: 24 }}>
      <Popover>
        <PopoverTrigger className="h-10 rounded-full border border-neutral-200 px-4 text-sm">
          アカウント
        </PopoverTrigger>
        <PopoverContent aria-label="アカウント" className="w-60 p-4 text-sm">
          ボタンの右端にそろえて浮かせる。外側を押す・Escape・中のリンクを押すと閉じる
        </PopoverContent>
      </Popover>
    </div>
  ),
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
