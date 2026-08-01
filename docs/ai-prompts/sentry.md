# Sentry実装パターン（このプロジェクト固有）

`@sentry/nextjs`の基本セットアップ（`sentry.server.config.ts`・`sentry.edge.config.ts`・`src/instrumentation-client.ts`・`src/instrumentation.ts`）は導入済み。ここでは「例外をどこで・どう捕まえるか」のこのプロジェクトの方針を定める。

## 基本方針: 例外を握りつぶす箇所には必ずSentryへ送る

Next.jsの`instrumentation.ts`の`onRequestError`フック（`Sentry.captureRequestError`）は、Route Handler・Server Component・Server Actionで**投げっぱなしにされた**未処理例外を自動的に拾う。

一方、`try/catch`で例外を捕まえて`console.error`だけで処理を終え、正常系のような戻り値（`NextResponse.json({...}, {status: 500})`等）を返している箇所は、この自動キャプチャの対象外になる。**catchブロックを書く＝Sentryへの自動送信を自分で無効化している**という理解を持つこと。

そのため、想定外の例外をcatchするすべての箇所で、`console.error`に加えて`Sentry.captureException`を呼ぶ。

```ts
import * as Sentry from "@sentry/nextjs";

try {
  await someUseCase(input, deps);
} catch (err) {
  Sentry.captureException(err, {
    tags: { webhook: "stripe", eventType: event.type }, // 検索・フィルタ用
    extra: { orderId: order.id, eventId: event.id }, // 調査に必要な追加情報
  });
  console.error("[何の処理か] 処理失敗:", err);
  return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
}
```

### 送らなくてよい例外

「クライアントの入力ミス」「署名検証失敗」のような**正常系の一部**として扱っているエラーパスは送らない。Sentryはアプリのバグ・想定外の障害を追うためのものであり、期待された400エラーで埋めると本当に重要なエラーが埋もれる。

参考実装: `src/app/api/webhooks/stripe/route.ts`（署名検証失敗の400パスは送らない。catchブロック内の例外のみ送る）

## `Sentry.setUser()`について: グローバルに呼ばない

このプロジェクトはCloudflare Workers（`@cloudflare/next-on-pages`）上で動く。CloudflareのisolateはHTTPリクエストをまたいで使い回されることがあるため、`src/middleware.ts`のようなグローバルスコープで`Sentry.setUser()`を呼ぶと、**別のリクエストのユーザー情報が混ざるリスクがある**。

`Sentry.setUser()`を呼ぶ場合は、必ず`auth()`を呼んでいる各Server Action・use-caseの入り口で、そのリクエストのスコープ内に閉じて呼ぶこと。

```ts
export async function someServerAction(...) {
  const { userId } = await auth();
  Sentry.setUser({ id: userId ?? undefined });
  // ...
}
```

## 冪等性とSentryは別問題

Webhookが同一イベントを複数回配信しても、`Sentry.captureException`を入れれば例外は検知できる。しかし「例外を投げずに間違った状態になる」バグ（例: `BRAND-160`）はSentryでは検知できない。catchブロックにSentry送信を入れることと、use-case側の冪等性（同じ入力で何度呼ばれても安全か）は別軸で両方考えること。

## 関連チケット

- `BRAND-152`: Webhookハンドラーへの適用（実装済み）
- `BRAND-153`: Server Action・use-case全般への横展開
- `BRAND-154`: `Sentry.setUser()`の導入
- `BRAND-155`: アラートルールの設定
