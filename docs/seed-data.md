# シードデータ一覧

`task seed`（またはstg向けは `task supabase:seed-users:stg` + `task supabase:seed-scenarios:stg` + `task sanity:seed`）で投入される開発用データの一覧。
定義の実体は `scripts/seed-users.ts`・`scripts/seed-scenarios.ts`・`scripts/seed-products.ts`。

Clerk は local と stg で別のインスタンス（docs/cicd.md「環境構成」）、Supabase も別のプロジェクトのため、テストアカウントはそれぞれの環境にシードする（local は `task supabase:seed-users`、stg は `task supabase:seed-users:stg`。`doppler run -c stg_deploy` の有無で投入先の Clerk・Supabase の両方が切り替わる。`SEED_USER_PASSWORD` は stg ではデプロイ用の config `stg_deploy` にだけある。docs/cicd.md）。Sanity は local と stg で共用のため、商品は一度シードすれば両方で使える。

---

## テストアカウント（`scripts/seed-users.ts`）

手動テスト用のアカウントで、各ランク1人ずつの個人会員 + standard の法人会員1人 + 管理者1人。存在しなければClerk側も新規作成する（べき等）。メールアドレスは local と stg で同じだが、Clerk のインスタンスが別のため、それぞれ別の Clerk ユーザー（`clerk_user_id` も別）になる。stg の Clerk と Supabase には、このアカウントだけを残す（それ以外は 2026-11-23 に削除した。ローカルの E2E が作る Clerk ユーザーはローカル用のインスタンスにできるため、ローカルの E2E では stg に行が増えない。#686。stg に対して走る `E2E Tests (stg)` では、後片付けのあとに Webhook が届いて行ができることがある）。未入会・退会済みの状態を確かめるときは、使い回さずに毎回新しいアカウントで登録する。

- **会員**: Supabase の `users` に、オンボーディングを終えた状態（`rank_code` はランクどおり・`onboarding_completed = true`・電話番号 `09012345678`・請求基準日 1日。法人会員は会社名 `株式会社テスト`・インボイス登録番号 `T1234567890123`、個人会員は両方とも空）の行を入れる。`clerk_user_id` の有効な行があれば更新し、無ければ作る（user.created Webhook が作った未入会の行も、この状態に上書きする）。退会済みの行は触らない。あわせて、ランクどおりの有効な（`status = 'active'`）`subscriptions` の行を会員ごとに1つ入れる（無いと利用停止と判定され、`/subscription-ended` しか開けないため。#380）。この行の Stripe の ID（`sub_seed_<users.id>`・`cus_seed_<users.id>`）はダミーで Stripe にはオブジェクトが無いため、シードの会員では退会・プラン変更など Stripe のサブスクリプションを呼ぶ操作は失敗する（確かめるときは新しいアカウントで登録する）
- **管理者**: スクリプトは `users` の行を作らない。Clerk の `publicMetadata.role = "admin"` だけ（Clerk で新規作成したときは、user.created Webhook が届く環境なら Webhook が未入会の行を作ることはある）
- 1件でも失敗したら、残りのアカウントを続けたうえで終了コード1で終わる（「完了しました」は出ない）

**パスワード**は全アカウント共通で、Doppler の `dev` と `stg_deploy` の両方の config の `SEED_USER_PASSWORD` に同じ値で入っている（local と stg で同じパスワードでログインできるようにするため）。リポジトリには書かない。実行するたびに既存のアカウントのパスワードもこの値に更新するので、値を変えたら `dev` と `stg_deploy` の両方を同じ値に変えてから `task supabase:seed-users` と `task supabase:seed-users:stg` を実行し直す。`SEED_USER_PASSWORD` が未設定ならアカウントを作らずに止まる。

| メールアドレス                       | 種別     | rank_code  |
| ------------------------------------ | -------- | ---------- |
| info+test_starter@wknd-studio.com    | 個人会員 | starter    |
| info+test_basic@wknd-studio.com      | 個人会員 | basic      |
| info+test_standard@wknd-studio.com   | 個人会員 | standard   |
| info+test_pro@wknd-studio.com        | 個人会員 | pro        |
| info+test_advanced@wknd-studio.com   | 個人会員 | advanced   |
| info+test_premium@wknd-studio.com    | 個人会員 | premium    |
| info+test_enterprise@wknd-studio.com | 個人会員 | enterprise |
| info+test_corporate@wknd-studio.com  | 法人会員 | standard   |
| info+test_admin1@wknd-studio.com     | 管理者   | -          |

管理者判定はSupabaseの列ではなく、Clerkの `publicMetadata.role === "admin"` で行っている（`src/middleware.ts`）。

---

## 商品カタログ（`scripts/seed-products.ts`）

Sanityにダミーのブランド・カテゴリ・商品・掛け率設定・デザインテーマを登録する（べき等・既存の `seed-*` IDを削除してから再作成）。

- **ブランド**: ReFa・GUCCI・LOEWE・HERMÈS・CHANEL
- **商品**: 各ブランド2〜3点、計12点。バッグ・レザー・スカーフ・財布・美容機器等
- **発送拠点**: `seed-refa-003`（注文後払い）と `seed-gucci-003`（注文時払い）が仕入れ先直送（`supplier_direct`）、それ以外は事務所経由（`office`）
- **デザインテーマ**: ReFa/GUCCIにアタッチ済み（未アタッチ時のデフォルト見た目との対比用）
- **掛け率設定**: デフォルト / 定価カタログ / 少なめ割引カタログ の3種類。CHANELの商品でブランド優先・商品優先の上書き動作を確認できる

詳細な商品ごとの設定（`min_rank`・掛け率上書き・支払いタイミング・発送拠点等）は `scripts/seed-products.ts` のコメントを参照。

---

## シナリオのデータ（`scripts/seed-scenarios.ts`）

テスト用アカウントに各状態の注文を入れ、local でも stg でも「ログインして見るだけ」で注文履歴・管理画面の注文を確かめられるようにする（issue #713）。local は `task supabase:seed-scenarios`（`task seed` にも含む）、stg は `task supabase:seed-scenarios:stg`。会員の行を使うため、先にテストアカウント（`task supabase:seed-users` / `:stg`）を入れておく（無ければ何も消さずに止まる）。

- **べき等**: シナリオの行には目印として決まった形のIDを付ける。先頭8文字は `5eed` ＋種類（`1` 注文・`2` 決済単位・`3` 明細）＋通し番号（10進3桁）で、注文なら `5eed1001-0713-4000-8000-000000000000` のようになる（管理画面は注文IDの先頭8文字を注文番号として出すため、注文ごとに `5EED1001`・`5EED1002`… と違う番号に見える。issue #736）。実行のたびに、IDが注文の範囲（`5eed1000-…` 〜 `5eed1999-…`）か古い形（issue #713 の時点の `5eed0713-` で始まるもの）の注文（明細・決済単位・状態の変化の履歴を含む）だけを消してから入れ直す。目印の無い行（手で作った注文・E2E が作る行）は消さない。注文日は実行した日から数えた日数前にするため、実行するたびに日付は新しくなる
- **商品**: 「商品カタログ」の商品（`seed-*`）を参照し、商品名・単価のスナップショットは会員のランクの価格（Sanity に登録する `prices` と同じ算出）にする
- **Stripe の ID はダミー**: Checkout Session の ID は `cs_test_seed_scenario_dummy_<n>`、Invoice の ID は `in_seed_scenario_dummy_<n>` で、Stripe にはオブジェクトが無い。本物のテストモードのオブジェクトにしないのは、支払い済み・キャンセル等の状態を作るには Stripe 側で決済を完了・失効させる必要があり、シードのたびに Stripe に行が増え続けるのに、表示の確認には ID の値そのものが要らないため。このデータでは、支払い完了の Webhook・返金・請求書の再送など、Stripe を呼ぶ・Stripe から呼ばれる操作は確かめられない（新しく注文して確かめる）
- **状態の変化の履歴**（`order_status_changes`）: どの注文にも注文確定（`customer`、`null → processing`）の行があり、最終の状態が `processing` 以外の注文には `processing → <最終の状態>`（`system`、理由 `シナリオのデータ: <シナリオ名>`）の行がある
- 調達（`procurement_tasks`）・出荷・返品の状態は入れていない。それぞれの機能の issue で、このシードに足す
- 統合テスト（`tests/integration/seed-scenarios.test.ts`）は目印の付いた注文をすべて消すため、`task test:integration` を流すと、そのDBに入れたシナリオのデータも消える。流したあとは入れ直す
- シナリオの注文の返品（`returns`）を手で作ると、その注文を消せずにシードが失敗する。先にその返品を消す

| アカウント                          | 入っているもの                                                                        | 確かめられること                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| info+test_starter@wknd-studio.com   | 注文なし                                                                              | 注文履歴の「注文はまだありません」                                                                       |
| info+test_standard@wknd-studio.com  | 注文24件（下表の9件 + 支払い済みの過去の注文15件）                                    | `orders.status` の全ての値（処理中・支払い済み・キャンセル・上限超過）、注文履歴のページ送り（21件以上） |
| info+test_corporate@wknd-studio.com | 注文3件（請求済み・未払い / その場の支払い・支払い済み / 注文後の支払い・支払い済み） | 法人会員の注文履歴                                                                                       |
| info+test_admin1@wknd-studio.com    | （会員の注文をすべて見られる）                                                        | 管理画面の注文一覧・詳細で上の各状態                                                                     |
| 上記以外の会員                      | 注文なし                                                                              | —                                                                                                        |

`info+test_standard` の9件（新しい順。日付は実行した日から数えた日数前）:

| 日数前 | シナリオ                               | `orders.status`  | 決済単位（`order_settlements`）                     |
| ------ | -------------------------------------- | ---------------- | --------------------------------------------------- |
| 2      | その場の支払い・未払い                 | `processing`     | Checkout `pending_payment`                          |
| 3      | 注文後の支払い・請求作成前             | `processing`     | なし（明細の `settlement_id` が NULL）              |
| 5      | 注文後の支払い・請求済み（未払い）     | `processing`     | Invoice `invoice_sent`                              |
| 8      | 支払いタイミングの混在                 | `processing`     | Checkout `paid`（注文後の支払いの明細は請求作成前） |
| 10     | 注文後の支払い・上限超過               | `limit_exceeded` | Invoice `limit_exceeded`                            |
| 12     | その場の支払い・キャンセル             | `cancelled`      | Checkout `cancelled`                                |
| 15     | 注文後の支払い・請求作成前にキャンセル | `cancelled`      | なし                                                |
| 18     | 注文後の支払い・支払い済み             | `paid`           | Invoice `paid`                                      |
| 20     | その場の支払い・支払い済み（数量2）    | `paid`           | Checkout `paid`                                     |

その場の支払い（`at_order`）の決済単位は、支払い済み・未払い・キャンセルの3つがそろう。当月の注文の合計は上限（standard は500万円）より十分小さいため、このアカウントで新しく注文することもできる。
