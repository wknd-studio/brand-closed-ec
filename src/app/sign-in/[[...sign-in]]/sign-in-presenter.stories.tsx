import type { Meta, StoryObj } from "@storybook/nextjs";
import { ClerkProvider } from "@clerk/nextjs";
import { SignInPresenter } from "./sign-in-presenter";

const meta = {
  title: "Pages/SignIn",
  component: SignInPresenter,
  // SignInコンポーネントはライブ表示にClerkコンテキストを要求するため、
  // このstoryにだけスコープしてProviderを付ける（NEXT_PUBLIC_CLERK_PUBLISHABLE_KEYが必要）
  decorators: [
    (Story) => (
      <ClerkProvider>
        <Story />
      </ClerkProvider>
    ),
  ],
} satisfies Meta<typeof SignInPresenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
