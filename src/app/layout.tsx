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
    <ClerkProvider afterSignOutUrl="/" localization={jaJP}>
      <html
        lang="ja"
        className={`${geistSans.variable} ${geistMono.variable} ${BRAND_FONT_VARIABLES} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
