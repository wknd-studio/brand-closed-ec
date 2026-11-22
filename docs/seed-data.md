# シードデータ一覧

`task seed`（またはstg向けは `task supabase:seed-users:stg` + `task sanity:seed`）で投入される開発用データの一覧。
定義の実体は `scripts/seed-users.ts` と `scripts/seed-products.ts`。

Clerk / Sanity は local と stg で共用のため、一度シードすれば両方の環境で同じデータが使える。Supabaseのみ local/stg でプロジェクトが分かれているため、`doppler run -c stg_deploy` の有無で投入先を切り替える（`SEED_USER_PASSWORD` はデプロイ用の config `stg_deploy` にだけある。docs/cicd.md）。

---

## テストアカウント（`scripts/seed-users.ts`）

手動テスト用のアカウントで、各ランク1人ずつの個人会員 + standard の法人会員1人 + 管理者1人。存在しなければClerk側も新規作成する（べき等）。Clerk（local・stg で共用）と stg の Supabase には、このアカウントだけを残す（それ以外は 2026-11-23 に削除した。ただし今は、ローカルで E2E を実行すると共用の Clerk の user.created Webhook が stg に未入会の行を作り、E2E の後片付けでも消えないため、stg の行は増えていく）。未入会・退会済みの状態を確かめるときは、使い回さずに毎回新しいアカウントで登録する。

- **会員**: Supabase の `users` に、オンボーディングを終えた状態（`rank_code` はランクどおり・`onboarding_completed = true`・電話番号 `09012345678`・請求基準日 1日。法人会員は会社名 `株式会社テスト`・インボイス登録番号 `T1234567890123`、個人会員は両方とも空）の行を入れる。`clerk_user_id` の有効な行があれば更新し、無ければ作る（user.created Webhook が作った未入会の行も、この状態に上書きする）。退会済みの行は触らない
- **管理者**: スクリプトは `users` の行を作らない。Clerk の `publicMetadata.role = "admin"` だけ（Clerk で新規作成したときは、user.created Webhook が届く環境なら Webhook が未入会の行を作ることはある）
- 1件でも失敗したら、残りのアカウントを続けたうえで終了コード1で終わる（「完了しました」は出ない）

**パスワード**は全アカウント共通で、Doppler の `dev` と `stg` の両方の config の `SEED_USER_PASSWORD` に同じ値で入っている（Clerk を local と stg で共用しているため）。リポジトリには書かない。実行するたびに既存のアカウントのパスワードもこの値に更新するので、値を変えたら `dev` と `stg` の両方を同じ値に変えてから `task supabase:seed-users:stg` を実行し直す。`SEED_USER_PASSWORD` が未設定ならアカウントを作らずに止まる。

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
- **デザインテーマ**: ReFa/GUCCIにアタッチ済み（未アタッチ時のデフォルト見た目との対比用）
- **掛け率設定**: デフォルト / 定価カタログ / 少なめ割引カタログ の3種類。CHANELの商品でブランド優先・商品優先の上書き動作を確認できる

詳細な商品ごとの設定（`min_rank`・掛け率上書き・支払いタイミング等）は `scripts/seed-products.ts` のコメントを参照。
