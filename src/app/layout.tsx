import { ClerkProvider } from "@clerk/nextjs";
import { jaJP } from "@clerk/localizations";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND_FONT_VARIABLES } from "@/lib/fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// jaJPのデフォルト文言はClerk汎用のもののため、waitlistまわりのみブランドのトーンに合わせて上書きする
const localization = {
  ...jaJP,
  signIn: {
    ...jaJP.signIn,
    start: {
      ...jaJP.signIn!.start,
      title: "ログイン",
      // Clerkデフォルトの「先行体験にご興味ありますか？/ウェイトリストに登録」を
      // waitlist画面側の表記(登録する)に揃える
      actionText__join_waitlist: "未登録の方は",
      actionLink__join_waitlist: "登録希望を送る",
    },
  },
  waitlist: {
    ...jaJP.waitlist,
    start: {
      ...jaJP.waitlist!.start,
      title: "登録希望を送る",
      subtitle:
        "メールアドレスをご登録いただくと、審査のうえご招待のご案内をお送りします。",
      formButton: "登録する",
      // ホーム画面のサインインリンクと表記を揃え、ブランドのトーン(会員限定・招待制)に合わせる
      actionText: "すでに会員の方は",
      actionLink: "ログイン",
    },
    success: {
      ...jaJP.waitlist!.success,
      title: "ご登録ありがとうございます",
      subtitle: "審査のうえ、ご登録のメールアドレス宛にご案内をお送りします。",
    },
  },
};

export const metadata: Metadata = {
  title: "Members",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/" localization={localization}>
      <html
        lang="ja"
        className={`${geistSans.variable} ${geistMono.variable} ${BRAND_FONT_VARIABLES} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
