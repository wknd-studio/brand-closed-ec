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
| `src/components/`     | UI部品。props で受け取った DTO を表示する                                                                                                                  | データの取得・書き込み。業務判断                                                           |
| `src/lib/`            | 業務を知らない共通部品（「src/lib に置くもの・置かないもの」を参照）                                                                                       | DBアクセス・業務ルール・組み立て・Server Action                                            |
| `src/emails/`         | メールテンプレート（React Email）。props を表示するだけ                                                                                                    | 送信処理（→ `src/infrastructure/resend/`）。データの取得                                   |

## 依存してよい方向

依存は**許可リスト**で考える。下の表に無い依存は禁止。新しいディレクトリを作っても、ここに足すまでは、どの層からも使ってはいけない（lint も許可リストの形で書く。#439）。

| 層                    | import してよいもの                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `src/domain/`         | 何にも依存しない（domain の中だけ。外部SDK・Next.js・React も不可）                      |
| `src/repositories/`   | domain                                                                                   |
| `src/queries/`        | domain                                                                                   |
| `src/use-cases/`      | domain・repositories（どちらも外部SDKは不可）                                            |
| `src/infrastructure/` | domain・repositories・queries・lib・emails・外部SDK                                      |
| `src/composition/`    | domain・repositories・queries・use-cases・infrastructure                                 |
| `src/app/`            | composition・domain（エラーの判別・値オブジェクト）・queries（DTOの型）・lib・components |
| `src/components/`     | domain（値オブジェクト・型）・queries（DTOの型）・lib・components                        |
| `src/lib/`            | lib と外部ライブラリ（Next.js・Clerk 等）だけ。業務の層（domain 以下）は使わない         |
| `src/emails/`         | lib・emails                                                                              |

- use-case から Query Service は使わない。書き込みの判断に要るデータは repository から集約として取る（読み取りと書き込みのモデルを混ぜないため）
- app・components・lib から repositories・infrastructure は使わない（#441）
- domain の内部の定数（ルールの正になっている `RANK_ORDER` 等）は domain の外で使わない。外からは value object・entity のメソッドを使う（#442）

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

## 組み立て（composition）

- repository・gateway・Query Service の実装の生成と use-case への注入は、`src/composition/` に置く
- **app は composition が返す use-case・Query Service だけを使う**。app の中で `new SupabaseOrderRepository(...)` のように実装を生成しない
- composition はサーバー側（Server Action・Route Handler・Server Component・middleware）からだけ使う。Client Component から import しない。use-case の依存（deps）を束ねた関数や、Query Service のインスタンスを返す
- composition に条件分岐を持つのは、環境による実装の差し替え（E2Eで外部送信を止める等）だけにする

## 外部サービスのクライアント

Supabase・Sanity・Stripe・Resend のクライアント生成は `src/infrastructure/` に置く（例: `src/infrastructure/supabase/client.ts`）。クライアントを使ってよいのは `src/infrastructure/` の中だけ（#440）。

- 例外: `src/sanity/`（Sanity Studio）は Studio の中で Sanity のクライアントを使ってよい（「層構成の対象外」を参照）
- Clerk の認証済みユーザーの取得（`auth()` を包んだ共通ヘルパー）は Next.js のリクエストに結びついた処理なので、`src/lib/auth/` に置く。Clerk の管理API（ユーザーの削除等）を呼ぶ処理は gateway として `src/infrastructure/clerk/` に置く

## src/lib に置くもの・置かないもの

`src/lib` には、**業務を知らない**共通部品だけを置く。「この関数はこのサービスの業務（注文・会員・ランク等）を知っているか」で判断し、知っていれば `src/lib` ではない。

置くもの:

- UIヘルパー（`cn` 等）
- Next.js 固有のヘルパー（フォント・テーマのスタイル生成等）
- 認証済みユーザーの取得（`src/lib/auth/`）
- 計測など、どの層からも使う横断的な道具で、業務を知らないもの（`src/lib/observability/`）

置かないもの:

- **DBアクセス**（→ repository・Query Service の実装として `src/infrastructure/`）
- **業務ルール**（→ `src/domain/`）
- **組み立て**（→ `src/composition/`）
- **Server Action**（→ それを使う画面の近くの `src/app/**/actions.ts`）
- 外部サービスのクライアント生成（→ `src/infrastructure/`）
- メールテンプレート（→ `src/emails/`）

## メールテンプレート

メールテンプレート（React Email）は `src/emails/` に置く（現在の `src/lib/email/templates/` から移す。#448）。テンプレートは props を受け取って表示するだけにし、送信（Resend の呼び出し）は `NotificationService` の実装（`src/infrastructure/resend/`）が行う。

## 層構成の対象外

次は Next.js アプリの層構成の対象外とし、Studio 側にまとめる。

- `src/sanity/`（Sanity Studio のスキーマ・構成・コンポーネント）
- Studio 用ツール（現在の `src/lib/product-import`。商品の取り込み）。`src/sanity/` 配下へ移す

これらは Studio の中で完結させ、Next.js アプリの層（domain・use-cases 等）から import しない。Studio から Next.js アプリの層を import することもしない。

## use-case は薄く、domain は厚く

業務ルール（判定）は entity・value object・domain service に置く。use-case が持つのは次だけ。

- 手順（何をどの順で呼ぶか）
- トランザクション境界
- 補償処理（途中で失敗したときの取り消し）
- 外部呼び出しの順序

use-case の中に `if (user.rankCode === "gold" && ...)` のような判定を書きたくなったら、それは domain のメソッドにする（例: 商品にアクセスできるかは `MemberRank.canAccess()`、退会できるかは User エンティティ（#446））。domain のメソッドにすると、DBもモックも無いユニットテストで分岐を確かめられる。

## 外側の関心事はポート経由

エラー通知（Sentry）・メール送信・外部サービスの操作など、外側の関心事は use-case から直接呼ばない。ポート（interface）を `src/repositories/` に定義し、実装を `src/infrastructure/` に置いて、composition で注入する（エラー通知のポート化は #447）。

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
- メールの見た目 → `src/emails/`
- 業務を知らない共通部品 → `src/lib/`

それでも決まらないときは、新しい置き場所を作らずにユーザーに相談する（このファイルに足してから使う）。
