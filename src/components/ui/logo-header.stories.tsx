import type { Meta, StoryObj } from "@storybook/nextjs";
import { LogoHeader } from "./logo-header";

const meta = {
  title: "UI/LogoHeader",
  component: LogoHeader,
} satisfies Meta<typeof LogoHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLink: Story = {
  args: { href: "/" },
};
