// Clerkのコンポーネント（<Waitlist>・<SignIn>・<SignUp>）をカードの中に置いたときの共通の見た目。
// 描画しない要素（Waitlistのソーシャルログイン等）の指定は無視される。
// Clerkのスタイル（CSS-in-JS）はTailwindのユーティリティに勝つため、クラスはすべて!付きで書く（#757）。
// Tailwindはソースの文字列からCSSを作るので、headingVariants等から組み立てずに文字のまま書く
export const clerkAppearance = {
  elements: {
    rootBox: "!w-full !max-w-full",
    // 余白を0にすると、Clerkのカードのoverflow: hiddenで入力欄の枠・チェックボックスの左端が切れる
    cardBox:
      "!w-full !max-w-full !overflow-visible !rounded-none !border-none !shadow-none",
    card: "!w-full !max-w-full !overflow-visible !border-none !bg-transparent !p-0 !shadow-none",
    // Waitlistの登録前(start)・登録後(success)どちらの文言もここで描画されるため、
    // 隠さずにブランドの見出しスタイル（headingVariants({ level: "compact" })）へ合わせる
    headerTitle:
      "!font-display !font-semibold !text-[clamp(1.4rem,2.6vw,1.8rem)] ![text-wrap:balance] !text-neutral-900",
    headerSubtitle: "!text-sm !text-secondary",
    // buttonVariants({ variant: "primary" })と同じ指定
    formButtonPrimary:
      "!inline-flex !items-center !justify-center !rounded-full !font-semibold !transition-shadow active:!translate-y-px focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-primary disabled:!pointer-events-none disabled:!opacity-50 !bg-gradient-to-br !from-primary-light !to-primary !text-primary-foreground !shadow-[0_10px_24px_-8px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] hover:!shadow-[0_14px_30px_-8px_color-mix(in_srgb,var(--color-primary)_55%,transparent)] !h-13 !px-[30px] !text-[0.92rem] !tracking-[0.03em] !w-full",
    formFieldInput:
      "!rounded-md !border !border-neutral-300 !px-3 !py-2 !text-sm focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-primary",
    // Clerkはフッターにグラデーションのbackground-imageを当てている
    footer: "!bg-none !bg-transparent",
    footerAction: "!text-sm !text-secondary",
    footerActionLink: "!text-primary hover:!underline",
    socialButtonsBlockButton:
      "!rounded-md !border !border-neutral-300 !text-sm",
    dividerLine: "!bg-neutral-200",
    dividerText: "!text-xs !text-secondary",
  },
  variables: {
    colorPrimary: "var(--color-primary)",
    borderRadius: "var(--radius-2xl)",
    fontFamily: "var(--font-sans)",
  },
};
