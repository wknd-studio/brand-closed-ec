"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import type { MemberAccountDto } from "@/queries/member-query-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopoverOpen,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import {
  CartButton,
  HeaderLimit,
  HeaderLimitBand,
} from "./cart-header-controls";

const NAV_ITEMS = [
  { href: "/shop", label: "ショップ" },
  { href: "/favorites", label: "お気に入り" },
  { href: "/orders", label: "注文履歴" },
] as const;

const SETTINGS_LABEL = "設定（住所・お支払い方法・退会）";

// 配下の画面（/shop/search・/orders/[id] 等）でも、そのナビを今のページとする
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header({
  account,
}: {
  account: MemberAccountDto | null;
}) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    current: isCurrent(pathname, item.href),
  }));

  return (
    <header className="relative z-20 border-b border-neutral-200 bg-white">
      {/* モックアップどおり、ヘッダーはページの本文（Container の1080px）より広い1200pxまで使う。
          ナビ・検索欄・仕入れ枠・カート・アカウントが1行に収まる1200px以上で、この並びにする */}
      <div data-header="desktop" className="hidden min-[1200px]:block">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-6 px-6">
          <Logo className="h-8" />
          {account && (
            <>
              <nav aria-label="メインメニュー" className="h-full">
                <ul className="m-0 flex h-full list-none p-0">
                  {navItems.map((item) => (
                    <li key={item.href} className="h-full">
                      <Link
                        href={item.href}
                        aria-current={item.current ? "page" : undefined}
                        className={cn(
                          "flex h-full items-center px-3.5 text-sm whitespace-nowrap transition-colors",
                          item.current
                            ? "font-semibold text-neutral-900 shadow-[inset_0_-2px_0_var(--color-primary)]"
                            : "text-neutral-700 hover:text-neutral-900"
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <SearchForm />
              <HeaderLimit planName={account.planName} />
              <CartButton />
              <AccountMenu account={account} />
            </>
          )}
        </div>
      </div>

      <Popover data-header="mobile" className="min-[1200px]:hidden">
        <div className="flex h-[60px] items-center gap-1 pr-2 pl-4">
          <Logo className="h-[26px]" />
          <div className="flex-1" />
          {account && (
            <>
              <Link
                href="/shop/search"
                aria-label="商品を検索"
                className="inline-flex size-11 items-center justify-center text-neutral-900"
              >
                <SearchIcon size={20} />
              </Link>
              <CartButton compact />
              <MobileMenuButton />
            </>
          )}
        </div>
        {account && (
          <>
            <HeaderLimitBand />
            <PopoverContent
              align="full"
              className="flex flex-col gap-2 border-b border-neutral-200 bg-white px-4 pt-2 pb-5 shadow-[0_24px_40px_-24px_color-mix(in_srgb,var(--color-neutral-900)_40%,transparent)]"
            >
              <nav aria-label="メインメニュー">
                <ul className="m-0 flex list-none flex-col p-0">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={item.current ? "page" : undefined}
                        className={cn(
                          "flex min-h-13 items-center justify-between border-b border-neutral-100 text-base text-neutral-900",
                          item.current &&
                            "pl-3 font-semibold shadow-[inset_3px_0_0_var(--color-primary)]"
                        )}
                      >
                        <span>{item.label}</span>
                        <ChevronRightIcon />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-neutral-50 p-3.5">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={account.name}
                    className="size-10 text-[0.9375rem]"
                  />
                  <span className="flex flex-col gap-[3px]">
                    <span className="text-[0.9375rem] font-semibold">
                      {account.name}
                    </span>
                    <span className="text-xs text-secondary">
                      {account.email}
                    </span>
                    <Badge tone="primary" className="self-start">
                      {account.planName}プラン
                    </Badge>
                  </span>
                </div>
                <Link
                  href="/settings"
                  className="flex min-h-11 items-center justify-between border-t border-neutral-200 text-sm text-neutral-900"
                >
                  {SETTINGS_LABEL}
                  <ChevronRightIcon />
                </Link>
                <SignOutButton className="w-full" />
              </div>
            </PopoverContent>
          </>
        )}
      </Popover>
    </header>
  );
}

function Logo({ className }: { className: string }) {
  return (
    <Link
      href="/shop"
      aria-label="EQ MART ショップのトップへ"
      className="inline-flex shrink-0"
    >
      <Image
        src="/logo.png"
        alt="EQ MART"
        width={919}
        height={346}
        className={cn("w-auto", className)}
        priority
      />
    </Link>
  );
}

function SearchForm() {
  return (
    <form
      role="search"
      action="/shop/search"
      method="get"
      className="relative ml-auto flex max-w-[220px] min-w-36 flex-1 items-center"
    >
      <span className="pointer-events-none absolute left-3.5 text-secondary">
        <SearchIcon size={16} />
      </span>
      <label htmlFor="header-search" className="sr-only">
        商品を検索
      </label>
      <input
        id="header-search"
        type="search"
        name="q"
        placeholder="商品名・ブランドで検索"
        className="box-border h-10 w-full rounded-full border border-neutral-200 bg-neutral-50 pr-3.5 pl-[38px] text-[0.8125rem] text-neutral-900 placeholder:text-neutral-500 focus:border-primary focus:outline-none"
      />
    </form>
  );
}

function AccountMenu({ account }: { account: MemberAccountDto }) {
  return (
    <Popover className="shrink-0">
      <PopoverTrigger className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-neutral-200 bg-white py-1 pr-3 pl-1 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Avatar name={account.name} className="size-[34px] text-sm" />
        <span className="text-[0.8125rem] font-semibold text-neutral-900">
          アカウント
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-neutral-700"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        aria-label="アカウント"
        className="flex w-[290px] flex-col p-2"
      >
        <div className="mb-1.5 flex flex-col gap-1.5 border-b border-neutral-200 px-3 pt-3 pb-3.5">
          <span className="text-[0.9375rem] font-semibold">{account.name}</span>
          <span className="text-xs break-all text-secondary">
            {account.email}
          </span>
          <Badge tone="primary" className="self-start">
            {account.planName}プラン
          </Badge>
        </div>
        <Link
          href="/settings"
          className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-neutral-900 hover:bg-neutral-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-neutral-700"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          {SETTINGS_LABEL}
        </Link>
        <SignOutButton className="mt-1" />
      </PopoverContent>
    </Popover>
  );
}

function MobileMenuButton() {
  const open = usePopoverOpen();
  return (
    <PopoverTrigger
      aria-label={open ? "メニューを閉じる" : "メニューを開く"}
      className="inline-flex size-11 cursor-pointer items-center justify-center text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
      </svg>
    </PopoverTrigger>
  );
}

// Clerkの読み込み前のsignOutは何もしないため、読み込むまで押せなくする
function SignOutButton({ className }: { className?: string }) {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!isLoaded}
      onClick={() => signOut({ redirectUrl: "/" })}
      className={cn("gap-2", className)}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
        <path d="M10 16l-4-4 4-4" />
        <path d="M6 12h10" />
      </svg>
      ログアウト
    </Button>
  );
}

// 氏名の頭文字の丸いアイコン
function Avatar({ name, className }: { name: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-light to-primary font-bold text-primary-foreground",
        className
      )}
    >
      {name.trim().charAt(0)}
    </span>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-secondary"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
