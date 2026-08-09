import type { Meta, StoryObj } from "@storybook/nextjs";
import { HomePresenter } from "./home-presenter";

const meta = {
  title: "Pages/Home",
  component: HomePresenter,
} satisfies Meta<typeof HomePresenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
