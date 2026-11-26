import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { LogoHeader } from "@/components/ui/logo-header";

export const metadata: Metadata = {
  title: "ページが見つかりません",
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col bg-neutral-50 text-neutral-900">
      <LogoHeader href="/" />
      <main className="flex flex-1 justify-center px-4 pt-16 pb-18">
        <div className="flex w-full max-w-[480px] flex-col items-center gap-3.5 self-start text-center">
          <span
            aria-hidden="true"
            className="font-display text-[64px] leading-none font-semibold tracking-[0.06em] text-primary"
          >
            404
          </span>
          <Heading as="h1" level="compact">
            ページが見つかりません
          </Heading>
          <p className="text-sm leading-[1.9] text-neutral-700">
            お探しのページは、移動または削除されたか、URL
            が間違っている可能性があります。
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-2" })}>
            トップへ戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
