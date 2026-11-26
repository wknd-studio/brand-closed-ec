import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import LegalNav from "@/app/legal/legal-nav";

/** 規約・表記の3つの文書の共通の枠。未ログインでも読めるため、会員のヘッダーは使わない（#838） */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <Container className="flex h-[68px] items-center justify-between gap-4">
          <Link href="/" aria-label="EQ MART トップへ" className="inline-flex">
            <Image
              src="/logo.png"
              alt=""
              width={919}
              height={346}
              className="h-8 w-auto"
              priority
            />
          </Link>
          <Link
            href="/"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            トップへ戻る
          </Link>
        </Container>
      </header>
      <Container className="flex w-full flex-1 flex-col gap-4 pt-5 pb-12 lg:flex-row lg:items-start lg:gap-10 lg:pt-12 lg:pb-20">
        <LegalNav />
        <main className="min-w-0 flex-1">{children}</main>
      </Container>
    </div>
  );
}
