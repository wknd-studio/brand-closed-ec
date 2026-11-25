# 本番の環境の設定のチェックリスト

本番（prod）の環境の設定がそろっているかを、ローンチ前・本番の設定を変えたあとに確かめる手順（#698）。stg で動いていても、本番の設定が1つ抜けていれば決済やログインが止まる。

機械で確かめられるものは `task env:check` で確かめ、確かめられないものは下の「手で確かめる項目」を1つずつ見る。

## `task env:check`（機械で確かめる項目）

```bash
task env:check -- prod   # 本番
task env:check -- stg    # stg（比べる元。NG 0件になることを先に確かめる）

# Supabase の third-party auth も確かめるとき（個人用トークン。Doppler には置かない。docs/cicd.md）
SUPABASE_ACCESS_TOKEN=<Supabase の個人用トークン> task env:check -- prod
```

- 項目ごとに `OK` / `NG` / `SKIP` と、NG・SKIP の直し方を出す。値は画面に出さない（キーは `sk_test_` 等の先頭の種類だけ）
- Doppler の `prod`・`prod_deploy` を読むため、その読み取り権限が要る。CI では流さない
- 各サービスの API は読み取りだけを行う。Clerk の Webhook の送り先だけは、Clerk の `POST /v1/webhooks/svix_url` で Svix のダッシュボードに入るための一時的なトークンを発行して読む（Clerk の Backend API に送り先を読む API が無いため。設定は変えない）
- 実装は `scripts/check-env.ts`。判定は `tests/unit/check-env.test.ts`

| 区分     | 確かめること                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doppler  | `prod`・`prod_deploy` に、`stg`・`stg_deploy` にある名前が全部ある。stg に無い名前が無い。stg だけの名前（`RESEND_TEST_TO`・`E2E_*`・`SEED_USER_PASSWORD`・`SANITY_AUTH_TOKEN`）が無い。値が空のものが無い                                                                                                  |
| Doppler  | 本番の値が stg と同じでない（Stripe・Clerk・Supabase・Sentry の `SENTRY_AUTH_TOKEN`・Resend・Sanity・Cloudflare のキーと `NEXT_PUBLIC_APP_URL`）。`NEXT_PUBLIC_SENTRY_DSN` は stg と同じ Sentry のプロジェクトを使うため比べない（requirements.md の 13-2）                                                 |
| Doppler  | Stripe・Clerk のキーが live（`sk_live_`・`rk_live_`・`pk_live_`）。`NEXT_PUBLIC_SENTRY_ENVIRONMENT` が `prod`、`NEXT_PUBLIC_SANITY_DATASET` が `production`                                                                                                                                                 |
| Stripe   | `<NEXT_PUBLIC_APP_URL>/api/webhooks/stripe` に向いた有効な Webhook の送り先があり、アプリが処理するイベント（`src/app/api/webhooks/stripe/route.ts` の `event.type`）を全部受け取る。`STRIPE_PRICE_ID_*` の Price が存在し、有効で、本番モードで、月額は `recurring`・入会金（`_INITIAL_FEE`）は `one_time` |
| Clerk    | `CLERK_SECRET_KEY` のインスタンスが Production。publishable key の Frontend API がそのインスタンスのドメインと一致し、`NEXT_PUBLIC_APP_URL` がそのドメインの下にある                                                                                                                                        |
| Clerk    | `<NEXT_PUBLIC_APP_URL>/api/webhooks/clerk` に向いた有効な Webhook の送り先があり、アプリが処理するイベント（`src/app/api/webhooks/clerk/route.ts` の `event.type`）を全部受け取る                                                                                                                           |
| Supabase | `supabase/migrations/` が全部適用されている（`SUPABASE_DB_URL` で `supabase migration list`）。third-party auth に Clerk の Frontend API のドメインが登録されている（`SUPABASE_ACCESS_TOKEN` が無ければ SKIP）                                                                                              |

stg だけ・本番だけの名前を足すときは、`scripts/check-env.ts` の許可リスト（`STG_ONLY_NAMES`・`STG_DEPLOY_ONLY_NAMES`・`PROD_ONLY_NAMES`・`STG_EMPTY_OK_NAMES`）に理由と一緒に足す。

## 手で確かめる項目

API で確かめられない、またはダッシュボードでしか見えない設定。確かめたら日付と確かめた人を PR・issue に残す。

- [ ] **DNS**: 本番のドメインの DNS が Cloudflare に向いている。Clerk の Production インスタンスが求める CNAME（`clerk.`・`accounts.`・メール用の `clkmail.` 等）と、Resend の送信元ドメインの SPF・DKIM・（あれば）DMARC のレコードがある。Clerk のダッシュボードの Domains で全て Verified
- [ ] **Clerk の Pro プラン**: Production インスタンスのアプリが Pro プラン（商用の前提。ローンチ直前に切り替える）
- [ ] **Clerk の設定**: Production インスタンスで、Self Service Delete が無効（#531）・Organizations が有効・管理者の Organization（`CLERK_ADMIN_ORGANIZATION_ID`）がある・stg と同じサインイン方法になっている・セッショントークンに `role: "authenticated"` が入る（`clerk config pull --instance prod --keys session`。手順は `docs/runbooks/clerk-supabase-role-claim.md`。無いと会員の操作が全て `42501` になる）
- [ ] **Stripe のカスタマーポータル**: 本番モードのキーで `scripts/setup-stripe-billing-portal.ts` を実行して作った設定（カードの変更・請求履歴だけが有効で、解約・プラン変更・宛名の変更が無効）の `bpc_...` が、prod の `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` に入っている（#216。手順は docs/domain/subscription-billing.md の「お支払い方法（カード）の変更」）
- [ ] **Stripe のサブスクリプションの設定**: 本番モードで「顧客のサブスクリプションを1つに制限」等、テストモードで入れている設定がそろっている（#435）
- [ ] **Stripe の税**: 本番モードの税の設定（Stripe Tax の有無・Price の `tax_behavior`）がテストモードと同じ
- [ ] **Stripe のインボイスの設定**: 本番モードの Settings → Billing → Invoices の、事業者の情報・適格請求書発行事業者の登録番号・請求書の表記がそろっている（#243）
- [ ] **Stripe のアカウント**: 本番モードが有効化済み（本人確認・入金先の口座）で、明細書表記がサービス名
- [ ] **Resend の送信元ドメイン**: `RESEND_FROM_EMAIL` のドメインが Resend の Domains で Verified。本番の `RESEND_API_KEY` がそのドメインだけに送れる
- [ ] **Sentry の通知先**: `environment:prod` の error が、運営者の通知先（メール等）に届くアラートのルールがある
- [ ] **Cloudflare の独自ドメイン**: Worker `brand-closed-ec-prod` に本番のドメインが Custom Domain として付き、`NEXT_PUBLIC_APP_URL` で開ける。証明書が有効
- [ ] **Supabase のバックアップ**: 本番のプロジェクトのプランで日次バックアップ（必要なら PITR）が有効。復元の手順を確かめてある
- [ ] **Supabase の認証まわり**: `SUPABASE_ACCESS_TOKEN` を渡さずに `task env:check` を流したなら、ダッシュボードの Authentication → Sign In / Providers → Third Party Auth に Clerk の本番のドメインがあるかを見る
