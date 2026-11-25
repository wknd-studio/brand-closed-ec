# Clerk のセッショントークンに `role: "authenticated"` を入れる

Supabase は Clerk のセッショントークンの `role` クレームで Postgres のロールを決める。`role` が無いトークンは `anon` として実行される。`anon` には `public` スキーマの権限を何も付けていない（`supabase/migrations/20261125161134_revoke_anon_privileges.sql`、issue #794）ため、`role` の無いインスタンスでは、会員の操作が全て `42501`（insufficient_privilege）になる。

Clerk の新しいインスタンスを作ったら、Supabase の Third-party Auth にドメインを登録するのと合わせて、この設定を必ず行う。手順は Supabase の公式ドキュメント（https://supabase.com/docs/guides/auth/third-party/clerk ）の「Connect with Supabase」と同じ結果になる。

## 設定済みのインスタンス

| インスタンス         | application     | 使う場所                                                              | 設定日           |
| -------------------- | --------------- | --------------------------------------------------------------------- | ---------------- |
| `legible-swan-6757`  | EQ Mart (local) | ローカル（Doppler `dev`・`dev_personal`）                             | 2026-11-26       |
| `happy-terrier-8249` | EQ Mart (CI)    | PR の CI の E2E（Doppler `ci`）                                       | 2026-11-26       |
| `natural-griffon-10` | EQ Mart         | stg・PRごとのプレビュー（Doppler `stg`・`stg_deploy`・`stg_preview`） | 2026-11-26       |
| Production           | EQ Mart         | 本番（Doppler `prod`・`prod_deploy`）                                 | 未（issue #700） |

インスタンスと Doppler の config の対応は、publishable key（`pk_test_` / `pk_live_` の後ろが Frontend API のドメインの base64）で確かめられる。

```bash
doppler secrets get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --plain -c <config> | sed 's/^pk_[a-z]*_//' | base64 -d
```

## 手順

Clerk の CLI（`clerk`）で、インスタンスの設定 `session.claims` に `role` を足す。既存のクレーム（`metadata`）は消さない。

1. application の ID を調べる

   ```bash
   clerk apps list --json | jq -r '.[] | "\(.application_id) \(.name) " + ([.instances[] | .environment_type] | join(","))'
   ```

2. 今の設定を見る（`--instance` は `dev` か `prod`）

   ```bash
   clerk config pull --app <application ID> --instance <dev|prod> --keys session
   ```

3. `session.claims` に `role` を足したものを、`--dry-run` で確かめる。`before` / `after` で、`claims.role` が増えるだけであることを見る。下の例の `metadata` は開発用のインスタンスの値。手順 2 で読んだ `claims` が違えば、その中身をそのまま残して `role` だけを足す（書かなかったクレームが消えないかを、`--dry-run` の `after` で確かめる）

   ```bash
   echo '{"session":{"claims":{"metadata":"{{user.public_metadata}}","role":"authenticated"}}}' > /tmp/claims.json
   clerk config patch --app <application ID> --instance <dev|prod> --file /tmp/claims.json --dry-run
   ```

4. `--dry-run` を外して当て、手順 2 でもう一度読んで `"role": "authenticated"` が入ったことを確かめる

   ```bash
   clerk config patch --app <application ID> --instance <dev|prod> --file /tmp/claims.json --yes
   ```

`session.claims` を変えると、ローカル・stg のそのインスタンスを使う全員に効く。変える前に必ず確認を取る。

## 順番の注意

- すでに発行済みのセッショントークンは、切れるまで（`session.lifetime`、今は60秒）古いまま（`role` 無し）。`anon` の権限を外すマイグレーションを当てるのは、この設定の後にする
- 本番は、`anon` の権限を外したマイグレーションが main に出る前に、Production インスタンスに設定する（issue #700）
