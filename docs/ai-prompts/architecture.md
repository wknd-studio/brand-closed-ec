# 層の責務と依存のルール（このプロジェクト固有）

このリポジトリは domain → use-cases → repositories（interface）→ infrastructure（実装）→ app という層で作られている。ここでは、各層に何を置き何を置かないか、どの層からどの層を使ってよいかを定める。新しいコードを書くとき・置き場所に迷ったときは、末尾の「置き場所の判断フロー」から読む。

lint（`eslint.config.mjs`）のエラーメッセージはこのファイルを参照する。lintで検出できない責務の違反（page に業務判断がある等）は、レビュー（`spec-reviewer`）で確認する。

既存コードには、このルールに沿っていない箇所がまだある（親issue #437 の子issueで直している）。既存コードを真似る前に、このファイルのルールを優先する。

## 層の一覧と責務

| 層                    | 置くもの                                                                                                                                                   | 置かないもの                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/domain/`         | entity・value object・domain service・ドメインのエラー。業務ルール（判定・計算・状態遷移）の正                                                             | DB・外部サービス・Next.js・React に関わるもの。手順（何をどの順で呼ぶか）                  |
| `src/repositories/`   | ポート（interface）。集約の永続化（repository）・外部サービスの操作（gateway）・通知やエラー通知などの外側の関心事                                         | 実装。画面用の型（→ `src/queries/`）                                                       |
| `src/use-cases/`      | 書き込みの操作の手順。トランザクション境界・補償処理・外部呼び出しの順序                                                                                   | 業務ルールの判定（→ domain）。読み取りだけの処理（→ Query Service）。DB・外部SDKの直接利用 |
| `src/queries/`        | Query Service の interface と、その戻り値の画面用DTOの型                                                                                                   | 実装（→ `src/infrastructure/`）                                                            |
| `src/infrastructure/` | ポートと Query Service の実装、外部サービスのクライアント生成、DBの行・外部APIのレスポンスと domain の間の変換（mapper）                                   | 業務ルールの判定（domain を呼んで使う）。手順（→ use-case）                                |
| `src/composition/`    | 組み立て。repository・gateway・Query Service の実装を生成し、use-case に注入して返す                                                                       | 業務ルール・手順・クエリ                                                                   |
| `src/app/`            | Next.js のルーティング（page・layout・Route Handler・Server Action）。入力の受け取り・認証済みユーザーの取得・composition が返すものの呼び出し・画面の表示 | 業務判断。DB・外部SDKの直接利用。repository・infrastructure の直接利用                     |
| `src/components/`     | UI部品。props で受け取った DTO を表示する。業務の状態を持つ Client Component（Provider 等。Server Action は props で受け取って呼ぶ）                       | データの取得・書き込みを自分で行うこと（Server Action の import を含む）。業務判断         |
| `src/lib/`            | 業務を知らない共通部品（「src/lib に置くもの・置かないもの」を参照）                                                                                       | DBアクセス・業務ルール・組み立て・Server Action                                            |
| `src/emails/`         | メールテンプレート（React Email）。props を表示するだけ                                                                                                    | 送信処理（→ `src/infrastructure/resend/`）。データの取得                                   |
| `src/types/`          | 生成物（`database.types.ts`。`supabase gen types` で作る DB の型）                                                                                         | 手で書く型（各層の中に置く）                                                               |

## 依存してよい方向

依存は**許可リスト**で考える。下の表に無い依存は禁止。新しいディレクトリを作っても、ここに足すまでは、どの層からも使ってはいけない（lint も許可リストの形で書く。#439）。

| 層                        | import してよいもの                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`             | 何にも依存しない（domain の中だけ。外部SDK・Next.js・React も不可）                                                                             |
| `src/repositories/`       | domain                                                                                                                                          |
| `src/queries/`            | domain                                                                                                                                          |
| `src/use-cases/`          | domain・repositories（どちらも外部SDKは不可）                                                                                                   |
| `src/infrastructure/`     | domain・repositories・queries・lib・emails・types・外部SDK                                                                                      |
| `src/composition/`        | domain・repositories・queries・use-cases・infrastructure                                                                                        |
| `src/app/`                | composition・domain（エラーの判別・値オブジェクト）・queries（DTOの型）・lib・components・外部SDK（DB・外部サービスのクライアントは除く。#440） |
| `src/components/`         | domain（値オブジェクト・型）・queries（DTOの型）・lib・components                                                                               |
| `src/lib/`                | lib と外部ライブラリ（Next.js・Clerk 等）だけ。業務の層（domain 以下）は使わない                                                                |
| `src/emails/`             | lib・emails                                                                                                                                     |
| `src/types/`              | 何にも依存しない（生成物）                                                                                                                      |
| `src/middleware.ts`       | composition・domain・queries・lib・外部SDK（app から components を除いたもの）                                                                  |
| `src/instrumentation*.ts` | 外部SDK（Sentry 等の初期化）だけ                                                                                                                |

- 同じ層の中（`src/use-cases/` から `@/use-cases/...` 等）は、表に書かなくても使ってよい。lint では、domain・repositories・queries・use-cases・infrastructure・app・middleware について、表に無い `@/` の import・外部SDK（表で許可した層を除く）・親ディレクトリへの相対 import（`../`）をエラーにする（#439）
- `src/types/`（DB の型）を使ってよいのは infrastructure だけ。DB の行の形を infrastructure の外に漏らさず、domain・DTO に変換して渡す
- use-case から Query Service は使わない。書き込みの判断に要るデータは repository から集約として取る（読み取りと書き込みのモデルを混ぜないため）
- app・middleware は composition が返す use-case（書き込み）・Query Service（読み取り）だけを使い、use-cases・repositories・infrastructure を直接 import しない。lint では、上の表どおりの許可リストで、表に無い `@/` の import と相対 import で層の外に出ること（app は `../`、middleware は相対 import すべて）をエラーにする（#441）
- components・lib から repositories・infrastructure・app は使わない。DB・外部サービスのデータは app で Query Service から取って props で渡し、Server Action も app から props で受け取る。lint では、この3つの import と、親ディレクトリへの相対 import（`../`）をエラーにする（components・lib は、表の許可リストより緩いこの禁止だけを lint する。#441）
- `import type` で repository・infrastructure の型だけを使う場合も禁止に含める。型だけの依存でも、画面が集約・DB の形に引きずられるため。画面で要る型は domain の型か queries の DTO を使う（#441）
- domain の内部の定数（ルールの正になっている `RANK_ORDER` 等）は domain の外で使わない。外からは value object・entity のメソッドを使う（#442）。lint では、`src/domain/` 以外の `src/` から `src/domain/` で export している定数を import するとエラーにする。定数を新しく export したら `eslint.config.mjs` の `DOMAIN_CONSTANTS` に足す（足し忘れると `tests/unit/lint/layer-imports.test.ts` が落ちる）。tests・scripts は対象外

## 書き込みと読み取り（CQRS）

- **書き込みは use-case を必ず通す**。Server Action・Route Handler（Webhook を含む）は、composition から use-case を取り出して呼ぶだけにする
- **読み取りは Query Service を通す**。page・layout・middleware が画面に出すデータは Query Service から取る
- どちらの場合も **app から DB・外部SDKを直接触らない**（`createClient`・`.from("...")`・`sanityClient.fetch` 等を app に書かない。#440）

repository を通さない直接クエリは、domain や repository にある業務ルールのコピーを生み、食い違う（実例: カートの今月の確定額がキャンセル済みの決済単位の明細を含んでいた #444）。

## Query Service

- **interface**: `src/queries/` に置く（例: `src/queries/member-order-query-service.ts`）。domain 以外に依存しない
- **実装**: `src/infrastructure/` に置く（例: `src/infrastructure/supabase/supabase-member-order-query-service.ts`）
- **戻り値**: 画面用のDTO。DTOの型は interface と同じファイル（`src/queries/`）に置く。集約の repository に画面用の型を足さない
- **業務ルール**: ランクによる表示制限・ランク別価格の選択などは、Query Service の実装の中で domain（`MemberRank` 等）を呼んで適用する。クエリの条件や実装の中に、同じ判定を書き直さない
- 1画面（または1つの用途）に1メソッドを基本にする。複数の画面で同じ形が要るときだけ共通にする
- **会員のデータの絞り込み**: 会員のデータを返すメソッドは、引数に会員（`clerkUserId`）を必須にし、実装のクエリでその会員の行だけに絞る。URL から来たID（`session_id`・`order_id` 等）だけで取らない。他の会員の行・存在しない行・画面の対象外の行は `null` を返し、page は `null` なら redirect する
- **命名**: interface は `<対象>QueryService`、メソッドは `find<画面・用途>`、DTO は `<画面・用途>Dto`。実装は `Supabase<対象>QueryService`

### 作り方の例（会員の注文系画面。#450）

```ts
// src/queries/member-order-query-service.ts — interface と DTO。domain 以外を import しない
export type InvoiceRequestedOrderDto = {
  orderId: string;
  createdAt: string; // Client Component に渡すため、Date ではなく ISO 文字列
  items: CompletedOrderItemDto[];
};

export interface MemberOrderQueryService {
  // 他の会員の注文・存在しない注文・後払いの明細が無い注文は null
  findInvoiceRequestedOrder(input: {
    clerkUserId: string;
    orderId: string;
  }): Promise<InvoiceRequestedOrderDto | null>;
}

// src/infrastructure/supabase/supabase-member-order-query-service.ts — 実装。DBの行を DTO に変換する
export class SupabaseMemberOrderQueryService implements MemberOrderQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findInvoiceRequestedOrder({ clerkUserId, orderId }) {
    const { data, error } = await this.db
      .from("orders")
      .select(
        "id, created_at, users!orders_user_id_fkey!inner(clerk_user_id, deleted_at), order_items(...)"
      )
      .eq("id", orderId)
      .eq("users.clerk_user_id", clerkUserId) // 会員で絞る
      .is("users.deleted_at", null)
      .maybeSingle();
    if (error) throw error; // エラーを握りつぶして null にしない（URL の不正な値など、null にすべきものだけ判別する）
    // ...
  }
}

// src/composition/member-order-query.ts — 組み立て。Query Service のインスタンスを返す
export async function memberOrderQueryService(): Promise<MemberOrderQueryService> {
  return new SupabaseMemberOrderQueryService(await createServerClient());
}

// src/app/(member)/order/invoice-complete/page.tsx — page は composition から受け取って呼ぶだけ
const queryService = await memberOrderQueryService();
const order = await queryService.findInvoiceRequestedOrder({
  clerkUserId: userId,
  orderId: order_id,
});
if (!order) redirect("/shop");
```

- **クライアント**: 会員の画面の読み取りは、ログイン中の会員のトークンで RLS を効かせた `createServerClient()` を使う（引数の会員による絞り込みと二重に守る）。そのため組み立て関数は `async` になる
- **組み立てのファイル**: 書き込みの組み立て（`src/composition/order.ts` 等）とは分け、`src/composition/<対象>-query.ts` に置く。page が使わない外部サービス（Sanity・Stripe 等）の実装を読み込まないため
- **テスト**: `tests/integration/supabase-<対象>-query-service.test.ts` に、実DBの統合テストを置く（例: `tests/integration/supabase-member-order-query-service.test.ts`）。メソッドごとに「取得できる」「他の会員のデータを取得できない」「存在しない」の3つを必ず書く。実装は service_role のクライアントで確かめ、組み立て（RLS 付きのクライアント）は `requireAuth` をモックしてテスト用のJWTを渡して確かめる

## 組み立て（composition）

- repository・gateway・Query Service の実装の生成と use-case への注入は、`src/composition/` に置く
- **app は composition が返す use-case・Query Service だけを使う**。app の中で `new SupabaseOrderRepository(...)` のように実装を生成しない
- composition はサーバー側（Server Action・Route Handler・Server Component・middleware）からだけ使う。Client Component から import しない。use-case の依存（deps）を束ねた関数や、Query Service のインスタンスを返す
- composition に条件分岐を持つのは、環境による実装の差し替え（E2Eで外部送信を止める等）だけにする

### 組み立て関数の形

ファイルは機能ごと（`src/composition/address.ts`・`order.ts`・`onboarding.ts` 等）に分ける。各ファイルは、**use-case と同じ名前・同じ入力で、`deps` だけを省いた関数**を export する（#449）。

```ts
// src/composition/member.ts
export function withdraw(input: WithdrawInput) {
  // Supabase のクライアントは呼び出しごとに1回作り、同じ組み立ての repository で共有する
  const supabase = createAdminClient();
  return withdrawUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    orderRepo: new SupabaseOrderRepository(supabase),
    subscriptionRepo: new SupabaseSubscriptionRepository(supabase),
    subscriptionGateway: new StripeSubscriptionGateway(),
    accountGateway: new ClerkAccountGateway(),
    errorReporter: new SentryErrorReporter(),
  });
}

// src/app/(member)/settings/actions.ts
import { withdraw } from "@/composition/member";
await withdraw({ clerkUserId: userId });
```

- 実装はモジュールの読み込み時ではなく、関数の呼び出しのたびに生成する（環境変数の無いビルド時・テストで読み込んでも失敗しないため）
- 同じ組み立てを複数の use-case で使うときは、ファイルの中に `deps` を作る関数を置いて共有してよい（例: `src/composition/order-payment.ts` の `paidOrderDeps`）
- 入口から使われないものを同じファイルに入れない。Webhook の route が `src/composition/order.ts`（注文の作成。Sanity を使う）を読み込まないよう、決済完了の組み立ては `src/composition/order-payment.ts` に分けている
- Webhook の署名検証など、use-case を通さずに Route Handler の入口で使う外部の操作は、関数として `src/infrastructure/` に置き（例: `src/infrastructure/stripe/stripe-webhook.ts`）、composition から re-export する（`src/composition/stripe-webhook.ts`）

## 外部サービスのクライアント

Supabase・Sanity・Stripe・Resend のクライアント生成は `src/infrastructure/` に置く（`src/infrastructure/supabase/server.ts`・`server-admin.ts`・`src/infrastructure/sanity/client.ts`・`src/infrastructure/stripe/client.ts`・`src/infrastructure/resend/client.ts`）。クライアントを使ってよいのは `src/infrastructure/` の中だけ（#440）。

- lint では、`src/infrastructure/`・`src/sanity/` 以外の `src/` で `@supabase/*`・`next-sanity`・`@sanity/client`・`stripe`・`resend` を import する・テーブルを文字列で指定する `.from("...")` を書くとエラーにする。tests・scripts は対象外。既存の違反は `eslint-suppressions.json`（ESLint の bulk suppressions）に記録してあり、直したら `pnpm exec eslint . --prune-suppressions` で抑制も消す（残すと `pnpm lint` が失敗する）。新しい違反を抑制に足さない
- 例外: `src/sanity/`（Sanity Studio）は Studio の中で Sanity のクライアントを使ってよい（「層構成の対象外」を参照）
- Clerk の認証済みユーザーの取得（`auth()` を包んだ共通ヘルパー）は Next.js のリクエストに結びついた処理なので、`src/lib/auth/` に置く。Clerk の管理API（ユーザーの削除等）を呼ぶ処理は gateway として `src/infrastructure/clerk/` に置く

## admin クライアントを使ってよい場合

`createAdminClient()`（`src/infrastructure/supabase/server-admin.ts`。service role）は RLS を通らない。composition では、会員のクライアント（`createServerClient()`。ログイン中の会員のトークンで RLS が効く）で組み立てるのを基本にし、次のどれかに当たるときだけ admin を使う（#568）。

1. **会員のセッションが無い入口**: Webhook（Stripe・Clerk）。署名を検証したイベントに含まれるID（Checkout Session・Invoice・Clerk の userId 等）で対象を取る
2. **運営者の操作・画面**: 運営者は `users` の行を持たず、会員向けの own のポリシーでは他の会員の行が見えない。権限は app（admin の layout・Server Action）で `role === "admin"` を確かめる
3. **会員本人の操作だが、会員のクライアントでは書けない・見えないもの**: 理由を composition に1行のコメントで書く
   - 会員向けのポリシーが無いテーブルへの書き込み、または anon・authenticated から実行権限を外した関数（RPC）を使う（例: 注文の保存の `place_order_with_limit_check`）
   - 退会済み（`deleted_at` あり）の行を見る・書く。`get_current_user_id()` は退会済みの会員を返さない（例: 退会の取り消し・退会済みの会員の再入会の拒否・middleware の退会の判定）
   - `users` への書き込み。会員のトークンで `users` を書かせない（#621）
   - `users` の行がまだ無い（入会の最初の保存）

admin で会員本人の操作を組み立てるときは、RLS の代わりに use-case・Query Service で持ち主を確かめる。

- 会員は、セッションの Clerk の userId（`requireAuth()`）で取る。画面から送られた会員ID・Clerk の userId を使わない
- 画面から送られた他の集約のID（住所ID・注文ID等）は、その会員の持ち物であることを確かめてから使う（その repository だけ会員のクライアントで組み立ててもよい）。IDだけで取ると、他の会員の行を読み書きできてしまう（実例: 住所の書き込み #567、注文の住所 #619）

## src/lib に置くもの・置かないもの

`src/lib` には、**業務を知らない**共通部品だけを置く。「この関数はこのサービスの業務（注文・会員・ランク等）を知っているか」で判断し、知っていれば `src/lib` ではない。

置くもの:

- UIヘルパー（`cn` 等）
- Next.js 固有のヘルパー（フォント・テーマのスタイル生成等）
- 認証済みユーザーの取得（`src/lib/auth/`）
- 計測など、app・infrastructure から使う横断的な道具で、業務を知らないもの（`src/lib/observability/`）。domain・use-cases から計測したいときは、ポート経由にする（「外側の関心事はポート経由」）

置かないもの:

- **DBアクセス**（→ repository・Query Service の実装として `src/infrastructure/`）
- **業務ルール**（→ `src/domain/`）
- **組み立て**（→ `src/composition/`）
- **Server Action**（→ それを使う画面の近くの `src/app/**/actions.ts`）
- 外部サービスのクライアント生成（→ `src/infrastructure/`）
- メールテンプレート（→ `src/emails/`）

## メールテンプレート

メールテンプレート（React Email）は `src/emails/` に置く。テンプレートは props を受け取って表示するだけにし、送信（テンプレートの描画と Resend の呼び出し）は `NotificationService` の実装（`src/infrastructure/resend/`）が行う。

## 層構成の対象外

次は Next.js アプリの層構成の対象外とし、Studio 側にまとめる。

- `src/sanity/`（Sanity Studio のスキーマ・構成・コンポーネント）
- Studio 用ツール（`src/sanity/tools/product-import/`。商品の取り込み）

これらは Studio の中で完結させ、Next.js アプリの層（domain・use-cases 等）から import しない。Studio から Next.js アプリの層を import することもしない。

## use-case は薄く、domain は厚く

業務ルール（判定）は entity・value object・domain service に置く。use-case が持つのは次だけ。

- 手順（何をどの順で呼ぶか）
- トランザクション境界
- 補償処理（途中で失敗したときの取り消し）
- 外部呼び出しの順序

use-case の中に `if (user.rankCode === "gold" && ...)` のような判定を書きたくなったら、それは domain のメソッドにする（例: 商品にアクセスできるかは `MemberRank.canAccess()`、退会できるかは User エンティティ（#446））。domain のメソッドにすると、DBもモックも無いユニットテストで分岐を確かめられる。

## 外側の関心事はポート経由

エラー通知（Sentry）・メール送信・外部サービスの操作など、外側の関心事は use-case から直接呼ばない。ポート（interface）を `src/repositories/` に定義し、実装を `src/infrastructure/` に置いて、composition で注入する（エラー通知は `ErrorReporter`（`src/repositories/error-reporter.ts`）。実装は `src/infrastructure/sentry/`）。

- use-case から `@sentry/nextjs` などの外部SDKを import しない
- app（Server Action・Route Handler）の catch での `Sentry.captureException` は、`docs/ai-prompts/sentry.md` のとおり app に書いてよい

## 置き場所の判断フロー

新しいコードの置き場所は、次の問いを上から順に当てはめ、最初に「はい」になったところに置く。

1. **業務ルールか**（判定・計算・状態遷移。「〜できるか」「いくらか」「次の状態は何か」）→ `src/domain/`（entity・value object・domain service）
2. **操作の手順か**（書き込みを伴い、複数の repository・gateway を順に呼ぶ。トランザクション・補償処理がある）→ `src/use-cases/`。使う外部の操作は `src/repositories/` に interface を足す
3. **画面用の読み取りか**（画面・middleware に出すデータを取る）→ interface と DTO は `src/queries/`、実装は `src/infrastructure/`
4. **形式の変換か**
   - DBの行・外部APIのレスポンスと domain の間の変換 → `src/infrastructure/`（mapper。例: `src/infrastructure/stripe/stripe-subscription-mapper.ts`）
   - 業務を知らない表示用の整形 → `src/lib/`
5. **組み立てか**（実装を生成して use-case・Query Service に渡す）→ `src/composition/`

どれにも当てはまらないとき:

- ルーティング・入力の受け取り・表示 → `src/app/`（Server Action は `src/app/**/actions.ts`）
- UI部品 → `src/components/`
- 業務の状態を持つ Client Component（お気に入りの `FavoritesProvider` 等）→ `src/components/`。Server Action は自分で import せず、Server Component（layout・page）から props で受け取る（例: `src/app/(member)/layout.tsx` → `src/components/favorites/favorites-provider.tsx`。#548）
- メールの見た目 → `src/emails/`
- 業務を知らない共通部品 → `src/lib/`

それでも決まらないときは、新しい置き場所を作らずにユーザーに相談する（このファイルに足してから使う）。
