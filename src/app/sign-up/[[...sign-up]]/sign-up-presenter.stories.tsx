import type { Meta, StoryObj } from "@storybook/nextjs";
import { ClerkProvider } from "@clerk/nextjs";
import { SignUpPresenter } from "./sign-up-presenter";

const meta = {
  title: "Pages/SignUp",
  component: SignUpPresenter,
  // SignUpコンポーネントはライブ表示にClerkコンテキストを要求するため、
  // このstoryにだけスコープしてProviderを付ける（NEXT_PUBLIC_CLERK_PUBLISHABLE_KEYが必要）
  decorators: [
    (Story) => (
      <ClerkProvider>
        <Story />
      </ClerkProvider>
    ),
  ],
} satisfies Meta<typeof SignUpPresenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
