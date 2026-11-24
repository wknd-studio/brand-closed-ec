import { buttonVariants } from "@/components/ui/button";
import { headingVariants } from "@/components/ui/heading";
import { cn } from "@/lib/cn";

// Clerkのコンポーネント（<Waitlist>・<SignIn>・<SignUp>）をカードの中に置いたときの共通の見た目。
// 描画しない要素（Waitlistのソーシャルログイン等）の指定は無視される
export const clerkAppearance = {
  elements: {
    rootBox: "!w-full !max-w-full",
    cardBox: "!w-full !max-w-full shadow-none",
    card: "!w-full !max-w-full border-none bg-transparent p-0 shadow-none",
    // Waitlistの登録前(start)・登録後(success)どちらの文言もここで描画されるため、
    // 隠さずにブランドの見出しスタイルへ合わせる
    headerTitle: cn(headingVariants({ level: "compact" }), "!text-neutral-900"),
    headerSubtitle: "!text-sm !text-secondary",
    formButtonPrimary: cn(
      buttonVariants({ variant: "primary" }),
      "w-full !text-primary-foreground"
    ),
    formFieldInput:
      "rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    footer: "bg-transparent",
    footerAction: "text-sm text-secondary",
    footerActionLink: "text-primary hover:underline",
    socialButtonsBlockButton: "rounded-md border border-neutral-300 text-sm",
    dividerLine: "bg-neutral-200",
    dividerText: "text-xs text-secondary",
  },
  variables: {
    colorPrimary: "var(--color-primary)",
    borderRadius: "var(--radius-2xl)",
    fontFamily: "var(--font-sans)",
  },
};
