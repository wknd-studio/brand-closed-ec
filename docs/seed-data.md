# シードデータ一覧

`task seed`（またはstg向けは `task supabase:seed-users:stg` + `task sanity:seed`）で投入される開発用データの一覧。
定義の実体は `scripts/seed-users.ts` と `scripts/seed-products.ts`。

Clerk / Sanity は local と stg で共用のため、一度シードすれば両方の環境で同じデータが使える。Supabaseのみ local/stg でプロジェクトが分かれているため、`doppler run -c stg` の有無で投入先を切り替える。

---

## テストアカウント（`scripts/seed-users.ts`）

各ランク1人ずつ + 管理者3人。存在しなければClerk側も新規作成した上でSupabaseにupsertする（べき等）。

**パスワードはメールアドレスと全く同じ文字列。**

| メールアドレス（= パスワード）       | 種別   | rank       |
| ------------------------------------ | ------ | ---------- |
| info+test_starter@wknd-studio.com    | 会員   | starter    |
| info+test_basic@wknd-studio.com      | 会員   | basic      |
| info+test_standard@wknd-studio.com   | 会員   | standard   |
| info+test_pro@wknd-studio.com        | 会員   | pro        |
| info+test_advanced@wknd-studio.com   | 会員   | advanced   |
| info+test_premium@wknd-studio.com    | 会員   | premium    |
| info+test_enterprise@wknd-studio.com | 会員   | enterprise |
| info+test_admin1@wknd-studio.com     | 管理者 | -          |
| info+test_admin2@wknd-studio.com     | 管理者 | -          |
| info+test_admin3@wknd-studio.com     | 管理者 | -          |

管理者判定はSupabaseの列ではなく、Clerkの `publicMetadata.role === "admin"` で行っている（`src/middleware.ts`）。

> 旧 `info+test_admin@wknd-studio.com` はシード対象から外れたが、Clerk上のアカウント自体は削除していない。

---

## 商品カタログ（`scripts/seed-products.ts`）

Sanityにダミーのブランド・カテゴリ・商品・掛け率設定・デザインテーマを登録する（べき等・既存の `seed-*` IDを削除してから再作成）。

- **ブランド**: ReFa・GUCCI・LOEWE・HERMÈS・CHANEL
- **商品**: 各ブランド2〜3点、計12点。バッグ・レザー・スカーフ・財布・美容機器等
- **デザインテーマ**: ReFa/GUCCIにアタッチ済み（未アタッチ時のデフォルト見た目との対比用）
- **掛け率設定**: デフォルト / 定価カタログ / 少なめ割引カタログ の3種類。CHANELの商品でブランド優先・商品優先の上書き動作を確認できる

詳細な商品ごとの設定（`min_rank`・掛け率上書き・支払いタイミング等）は `scripts/seed-products.ts` のコメントを参照。
