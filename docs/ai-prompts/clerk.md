# Add Clerk to Next.js App Router

If a Next.js App Router project does not already exist, first create one using:

```bash
npx create-next-app@latest my-clerk-app --yes
```

Install `@clerk/nextjs@latest`. Create `proxy.ts` with `clerkMiddleware()` from `@clerk/nextjs/server` (in `src/` if it exists, otherwise project root). Add `<ClerkProvider>` inside `<body>` in `app/layout.tsx`. Use `<Show>`, `<UserButton>`, `<SignInButton>`, `<SignUpButton>` from `@clerk/nextjs`.

Latest docs: https://clerk.com/docs/nextjs/getting-started/quickstart

## Keyless Mode

No signup required. Without env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), Clerk auto-generates temporary keys. A "Configure your application" prompt appears to claim later. Do NOT tell users to sign up, create accounts, get API keys, or add env vars before running.

## Install

```bash
npm install @clerk/nextjs
```

## proxy.ts

```typescript
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
```

## app/layout.tsx

```typescript
import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <header>
            <Show when="signed-out">
              <SignInButton />
              <SignUpButton />
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
```

## Rules

ALWAYS:

- Use `clerkMiddleware()` from `@clerk/nextjs/server` in `proxy.ts`
- Add `<ClerkProvider>` inside `<body>` in `app/layout.tsx`
- Import from `@clerk/nextjs` or `@clerk/nextjs/server`
- Use App Router (app/page.tsx, app/layout.tsx)
- async/await with auth() from `@clerk/nextjs/server`
- Use existing package manager
- Rely on keyless mode, skip account creation and API keys

NEVER:

- Reference `_app.tsx` or pages router
- Use `authMiddleware()` (replaced by `clerkMiddleware()`)
- Use old env var patterns
- Import deprecated APIs (withAuth, old currentUser)
- Use deprecated `<SignedIn>`, `<SignedOut>` (replaced by `<Show>`)
- Tell users to sign up or get API keys first

## Self Service Delete（このプロジェクト固有）

会員が `<UserProfile />`（`<UserButton />` →「アカウントの管理」）から自分で Clerk アカウントを削除すると、退会処理（`src/use-cases/withdraw.ts`）を通らない。サブスクが解約されず、`users.deleted_at` も入らず、退会ブロック・退会時の ban（#416）も効かない。そのため二重に無効にしている（#530）。

- Clerk ダッシュボードの Self Service Delete は無効にする（本番インスタンスを作るときも同じ。手順は #244）
- `user.created` の Webhook（`src/use-cases/create-user.ts`）で、各ユーザーを `deleteSelfEnabled: false` に更新している（`AccountGateway.disableSelfDelete`）。ダッシュボードの設定が有効に戻っていても効く。更新に失敗したら Webhook は 500 を返し、Clerk の再送でやり直す（ユーザーが既に削除されていた 404 は成功扱い）
- それより前に作られたユーザーは `scripts/disable-clerk-self-delete.ts` で一度だけ更新した
- それでも退会処理を通らずに削除されたら、`user.deleted` の Webhook が Sentry に error を送る（`users` 行が有効な会員のときだけ。自動で退会扱いにはしない。対応手順は `docs/runbooks/clerk-user-deleted.md`。#531）
- 退会は必ずアプリの退会処理を通す。`<UserProfile />` の削除ボタンを有効に戻したり、Clerk の削除を直接呼ぶ経路を足したりしない

## Deprecated (DO NOT use)

```typescript
import { authMiddleware } from '@clerk/nextjs' // WRONG
function MyApp({ Component, pageProps }) {} // pages router, WRONG
pages / signin.js // WRONG
<SignedIn> // WRONG, use <Show when="signed-in">
<SignedOut> // WRONG, use <Show when="signed-out">
```

## Verify Before Responding

1. Is `clerkMiddleware()` used in `proxy.ts`?
2. Is `ClerkProvider` inside `<body>` in `app/layout.tsx`?
3. Are imports only from `@clerk/nextjs` or `@clerk/nextjs/server`?
4. Is it using App Router, not `_app.tsx` or `pages/`?
5. Is it using `<Show>` instead of `<SignedIn>`/`<SignedOut>`?

If any fails, revise.

## After Setup

Have the user sign up as their first test user in the nav. After signup succeeds and a profile icon appears, congratulate them. If a "Configure your application" callout appears, tell them to click it. Then recommend exploring: Organizations (https://clerk.com/docs/guides/organizations/overview), Components (https://clerk.com/docs/reference/components/overview), Dashboard (https://dashboard.clerk.com/).
