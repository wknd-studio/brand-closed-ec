import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/container";

/**
 * ロゴだけを中央に置いたヘッダー。会員のメニューを出さない画面（ご契約の終了・404・全体のエラー）で使う。
 * `href` を渡すとロゴをそのページへのリンクにする
 */
export function LogoHeader({ href }: { href?: string }) {
  const logo = (
    <Image
      src="/logo.png"
      alt="EQ MART"
      width={919}
      height={346}
      className="h-9 w-auto"
      priority
    />
  );

  return (
    <header className="border-b border-neutral-200 bg-white">
      <Container className="flex justify-center py-4">
        {href ? (
          <Link
            href={href}
            aria-label="EQ MART トップへ"
            className="inline-flex"
          >
            {logo}
          </Link>
        ) : (
          logo
        )}
      </Container>
    </header>
  );
}
