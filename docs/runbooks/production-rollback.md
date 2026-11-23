# 本番で不具合が出たときのロールバック

本番（`main` → `brand-closed-ec-prod`）へのデプロイの後に不具合が出たときの手順（#697）。判断 → 戻す → 確かめる → 連絡する、の順に進める。アプリのロールバックは stg で実際に試した（2026-11-23。結果は末尾の「stg で試した記録」）。

戻し方は対象ごとに違い、前にしか進まないもの・履歴が残らないものがある。

| 対象                    | 戻し方                                                     | 戻るまで      | 履歴                                    |
| ----------------------- | ---------------------------------------------------------- | ------------- | --------------------------------------- |
| アプリ（Worker）        | `wrangler rollback <版のID>`、または revert して再デプロイ | 数秒／十数分  | Cloudflare の版（直近 100 版）          |
| DB のスキーマ           | 打ち消すマイグレーションを新しく書いて進める               | hotfix の流れ | `supabase/migrations/`（git）           |
| DB のデータ             | バックアップ・PITR から復元（DB 全体が置き換わる）         | 数十分〜      | Supabase のプランによる                 |
| Worker の secret        | Doppler の履歴から戻して再デプロイ                         | 再デプロイ    | Doppler の config のログ                |
| Sanity の Studio        | 前のコードで `sanity deploy` し直す                        | 数分          | git                                     |
| Sanity のデータ（商品） | ドキュメントの履歴から戻す                                 | 手作業        | プランによる（Free 3 日・Growth 90 日） |
| Clerk・Stripe の設定    | ダッシュボードで手で戻す                                   | 手作業        | 残らないものがある。変える前に控える    |

---

## 1. 判断: 戻すか・直して進めるか

まず **いつのデプロイから起きたか** を確かめる（Sentry の初出の時刻・`wrangler deployments list` のデプロイの時刻）。デプロイと関係のない不具合（外部サービスの障害・データの問題）なら、アプリを戻しても直らない。

| 状況                                                                               | 選ぶもの                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 直前のデプロイから壊れた・原因がすぐ分からない・会員の購入やログインが止まっている | **アプリをすぐ戻す**（`wrangler rollback`）。そのあと落ち着いて直す      |
| 直前のデプロイにマイグレーションが含まれ、前の版のアプリが新しいスキーマで動かない | アプリは戻せない。**直して進める**（hotfix）か、スキーマも打ち消して戻す |
| 原因が分かっていて、数行で直せる                                                   | **直して進める**（hotfix）。直すまでの間に被害が出るなら、先に戻す       |
| データが壊れた（誤った更新・削除）                                                 | アプリを戻して書き込みを止めてから、データを直す（6 章）                 |
| Clerk・Stripe・Sanity・secret の設定を変えた直後から起きた                         | その設定を戻す（5・7・8 章）。アプリは戻さない                           |

迷ったら、マイグレーションを含まないデプロイなら戻す。戻すのは数秒で、戻した後でも直して進められる。

---

## 2. アプリ（Cloudflare Workers）を戻す

### 2-1. `wrangler rollback`（数秒・ビルドしない）

前の版を、ビルドし直さずにそのまま 100% に出す。メインのチェックアウトで行う（ワークツリーでは Doppler の値がずれるため）。

```bash
# 版の一覧（直近 10 件。Source が Upload／version_upload のものがコードを上げた版、Secret Change は secret だけを変えた版）
doppler run -c prod_deploy -- pnpm exec wrangler versions list --config wrangler.prod.jsonc
doppler run -c prod_deploy -- pnpm exec wrangler deployments list --config wrangler.prod.jsonc

# 今出ている版
doppler run -c prod_deploy -- pnpm exec wrangler deployments status --config wrangler.prod.jsonc

# 戻す（--message を付けると確認を聞かずに進む）
doppler run -c prod_deploy -- pnpm exec wrangler rollback <版のID> \
  --message "<issue番号> <理由>" --config wrangler.prod.jsonc
```

**版の ID は必ず指定する。** 省略すると「最新の 1 つ前の版」に戻るが、1 デプロイで版は複数できる（`wrangler secret bulk` で 1 つ・`wrangler deploy` で 1 つ。stg は E2E の前後の `secret put`・`secret delete` でさらに 2 つ）。省略すると、コードは同じで secret だけが違う版に戻ることがある（stg で確かめた。stg の最新は E2E の後の `secret delete` の版で、1 つ前はメールの送信を止めた版だった）。

戻す先は「壊れたデプロイの前に出ていた版」= `deployments list` で、壊れたデプロイの最初の `Secret Change`（Sync のステップの `secret bulk`）の **1 つ前** のデプロイの版。コードが違うことは `versions view <版のID> --json` の `resources.script.etag` で確かめられる（同じコードなら同じ値）。

**戻せないとき**（Cloudflare のドキュメント）:

- Durable Object のクラスの追加・削除（`wrangler.*.jsonc` の `migrations`）が、今の版と戻す先の間にある
- 戻す先の版が、もう無い KV・R2・Queue に結び付いている
- 直近 100 版より前、または 30 日を超えて消された版

`wrangler rollback` は DB・Durable Object の中身を戻さない。DB のスキーマが前の版のアプリと合わないなら、戻すとかえって壊れる（4 章）。

#### ロールバック中の制約（重要）

ロールバックすると「最新の版」と「出ている版」がずれる。この間は次のとおり（stg で確かめた）。

- `wrangler secret put`・`secret bulk`・`secret delete` が `Secret edit failed. ... the latest version of your Worker isn't currently deployed.` で失敗する（exit 1）
- そのため、**CI の Deploy (production) は Sync Wrangler Secrets & Deploy のステップで失敗する**（`secret bulk` が先に動くため）。Migrate DB はその前に動くので、DB だけが新しくなる
- `wrangler secret list` は最新の版の一覧を出す。戻した版の secret の一覧は `versions view <版のID> --json` の `resources.bindings` で見る
- `wrangler deploy` は通る。できた版の secret は、出ていた（戻した）版ではなく **最新の版** のものを引き継ぐ。出した後は「最新の版 = 出ている版」に戻り、secret の変更もできるようになる

直したものを CI で出す前に、次のどちらかで「最新の版 = 出ている版」に戻す。

- **直したコードを手でデプロイする**（推奨）: hotfix を `main` にマージした後、CI の Deploy (production) が Sync で失敗したら、メインのチェックアウトでそのコミットを `git switch --detach origin/main` で取り、`doppler run -c prod_deploy -- pnpm build:cloudflare` → `doppler run -c prod_deploy -- pnpm exec wrangler deploy --config wrangler.prod.jsonc --message "<issue番号> hotfix"` を行う。そのあと失敗したジョブを Re-run する（secret を同期して同じコードを出し直す）
- 壊れた版に戻す（`wrangler rollback <最新の版のID>`）: 壊れた版がまた出るので、本番では使わない。stg で試した後に元へ戻すときに使う

CI が `wrangler deploy --secrets-file` で secret とコードを 1 つの版で出すように変えれば、この手作業は要らなくなる（#708。ロールバック中に `--secrets-file` で出せることは stg で確かめた）。

### 2-2. revert して再デプロイ（十数分・CI を通す）

戻すことをコードに残す方法。`wrangler rollback` で急場をしのいだ後、`main` を直す正式な方法としても使う。

1. メインのチェックアウトで、`main` から hotfix のブランチを切り、原因のマージコミットを revert する
   ```bash
   git fetch origin main
   git switch -c hotfix/<issue番号>-revert-<内容> origin/main
   git revert -m 1 <原因のマージコミット>
   ```
2. revert にマイグレーションのファイルの削除が含まれていたら止まる。マイグレーションのファイルは消さず、打ち消すマイグレーションを足す（4 章）
3. `task check` を通し、`main` に向けて PR を作る。`hotfix/*` は `Stg E2E Check` の対象外（stg を通らない）。レビュー 1 名以上・CI が全部 green でマージする（`requirements.md` の 4-3）
4. マージすると Deploy (production) が動く。`wrangler rollback` で戻した後なら Sync で失敗するので、2-1 の「ロールバック中の制約」の手順で出す
5. **同じブランチを `develop` にも PR してマージする**（バックマージ。忘れると次の `develop` → `main` で不具合が戻る）

`feature/*` から `main` への PR・`main` への直接 push はしない（CLAUDE.md のブランチ戦略）。

---

## 3. 戻した後の確認（スモークテスト）

1. 出ている版が戻す先の版になっている: `wrangler deployments status`（`Version(s): (100%) <版のID>`）
2. スモークテスト
   - stg: `doppler run -c stg_deploy -- sh -c 'BASE_URL=$NEXT_PUBLIC_APP_URL pnpm test:e2e:smoke'`（メインのチェックアウトで。ログインに使うアカウントは `tests/e2e/smoke/smoke.spec.ts` の冒頭）
   - 本番: ログインしないスモークテストは #696 で作る。それまでは手で、トップ・`/sign-in`・会員でログインして `/shop` に商品が出る・運営者で管理画面が開く、を確かめる
3. Sentry に、戻した後の新しいエラーが出ていない（戻した時刻より後のイベント）
4. Stripe の Webhook（ダッシュボードの Webhook のエンドポイント）に、失敗した配信が溜まっていない。不具合の間に失敗した配信は Stripe が自動で再送する（最大 3 日）。急ぐなら、直した後にダッシュボードから再送する
5. Clerk の Webhook も同じく失敗が溜まっていないか（Clerk ダッシュボードの Webhooks → Logs）

---

## 4. DB のスキーマ（マイグレーション）

`supabase db push` は前にしか進まない。適用済みのマイグレーションを戻すコマンドは無い（`supabase migration repair --status reverted` は履歴の表から行を消すだけで、スキーマは変わらない。使わない）。

### 4-1. 打ち消すマイグレーションの書き方

適用済みのファイルは消さない・書き換えない。打ち消す SQL を新しいマイグレーションとして足し、hotfix の流れ（2-2）で出す。

```bash
supabase migration new revert_<元の名前>
```

| 元のマイグレーション       | 打ち消すマイグレーション                                                               |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 列・テーブルの追加         | `drop ... if exists`。入ったデータが消えてよいかを先に確かめる（要るなら退避してから） |
| 関数・トリガーの変更       | 元のファイル（git）から前の定義を `create or replace` で書き戻す                       |
| ポリシーの追加・削除       | `drop policy` ／ 前の定義で `create policy` を書き戻す                                 |
| 列の削除・データの書き換え | スキーマは書き戻せるが、データは戻らない。バックアップから戻す（6 章）                 |

- 打ち消すマイグレーションもローカルで `bash scripts/with-worktree-db.sh supabase db reset` を通し、`supabase gen types typescript --local > src/types/database.types.ts` を再生成する（`Schema Types Drift`）
- タイムスタンプは `develop` の最新より新しくする（`Migration Order`）。hotfix を `develop` にバックマージするときに順番が崩れていないかを見る

### 4-2. マイグレーションを含むデプロイの前に確かめること

CI は Migrate DB → Build → Deploy の順に動く。マイグレーションが通ってデプロイが失敗したとき・アプリだけを `wrangler rollback` で戻したときは、**新しいスキーマの上で前の版のアプリが動く**。`develop` → `main` の PR を作るとき（マイグレーションを含むなら）、次を確かめて PR 本文に書く。

- **前の版のアプリが、新しいスキーマで動くか**。動くなら、アプリは `wrangler rollback` で戻せる
  - 動く（戻せる）: テーブル・nullable な列・default のある列・関数・インデックスの追加、ポリシーを緩める変更
  - 動かない（戻せない）: 列・テーブルの削除と名前の変更、型の変更、default の無い `not null` の追加、関数の引数・戻り値の変更、前の版が使っている関数の削除、ポリシーを狭める変更
- 動かない変更は、1 回のデプロイにまとめない。**広げる → アプリを切り替える → 狭める** の 3 つのリリースに分ける（例: 列の名前を変えるなら、新しい列を足して両方に書く → 新しい列を読むアプリに切り替える → 古い列を消す）。各リリースは前の版に戻せる
- それでも 1 回で出すなら、戻せないことを PR 本文に書き、出した後に壊れたら「直して進める」と決めておく

---

## 5. Worker の secret

secret は Worker の版に含まれる。`wrangler rollback` で戻した版は、その版を作った時点の secret の一覧（`versions view` の `resources.bindings`）で動く。値まで戻るかは Cloudflare のドキュメントに書かれていないが、版は作った後に変わらないため、値も戻した版のものと考えてよい（`secret list` は最新の版を出すので、確かめるのに使えない）。

secret の値だけを誤って変えたとき（アプリのコードは正しい）:

1. Doppler の履歴から前の値に戻す
   ```bash
   doppler configs logs -p brand-closed-ec -c prod            # 変更のログ（ログIDを探す）
   doppler configs logs rollback <ログID> -p brand-closed-ec -c prod
   ```
2. Deploy (production) の最後の実行を Re-run する（Sync で `secret bulk` して同じコードを出し直す）。`wrangler rollback` で戻している間は Sync が失敗する（2-1）
3. 急ぐなら、`deployments list` で、値を変える前の版に `wrangler rollback <版のID>` で戻す（コードも同じなら secret だけが戻る）

Worker の secret を Cloudflare のダッシュボードや `wrangler secret put` で直接変えない。Doppler とずれ、次のデプロイで Doppler の値に上書きされる。

---

## 6. DB のデータ（バックアップ）

誤った更新・削除でデータが壊れたときは、先にアプリを戻すか・該当の機能を止めて書き込みを止めてから直す。

- 範囲が分かるなら、SQL で直す（Supabase の SQL Editor。`docs/runbooks/clerk-user-deleted.md` のように手順を残す）
- 範囲が広いなら、バックアップから戻す。**復元は DB 全体を置き換え、その間プロジェクトに繋がらない**。戻した時点より後の注文・会員の登録も消えるため、運営者・クライアントと決めてから行う
  - 日次のバックアップ: Supabase ダッシュボードの Database → Backups
  - PITR（有効なら）: Database → Backups → Point in Time。秒単位で戻せる
  - 今のデータを残したまま調べるなら、新しいプロジェクトに復元して、要る行だけを本番に書き戻す
  - Storage のファイルは戻らない。Webhook・Realtime 等のサブスクリプションは復元の前に外し、後で作り直す

### 人間が確かめる項目（本番のプランが決まったら埋める。#699）

- [ ] 本番の Supabase のプラン: （未記入）
- [ ] 日次のバックアップの日数（Pro 7 日・Team 14 日・Enterprise 30 日。Free には無く、`supabase db dump` で自分で取る）: （未記入）
- [ ] PITR の有無と日数（Pro 以上の有料のアドオン。7・14・28 日。有効にすると日次のバックアップは取られなくなる）: （未記入）
- [ ] 復元を一度 stg か新しいプロジェクトで試し、かかった時間: （未記入）

---

## 7. Sanity

- **Studio**（`sanity deploy`）: 版の履歴・ロールバックは無い。前のコードで出し直す。メインのチェックアウトで `git switch --detach <前のコミット>` → `doppler run -c prod_deploy -- pnpm sanity deploy`。正式には revert して hotfix の流れ（2-2）で直す（CI の Deploy Sanity Studio は Deploy (staging) にだけあり、Deploy (production) には無いため、本番の Studio はどちらにしても手で出す）
- **データ（商品）**: 各ドキュメントの History から前の版を開き、Restore する。履歴が残るのはプランによる（Free 3 日・Growth 90 日・Enterprise 365 日）。Growth のトライアルが終わる（2026-12-11 頃）と短くなるため、契約の判断（#674）の後に確かめる
- 大きな作業の前は、データセットを書き出しておく: `doppler run -c prod_deploy -- pnpm sanity dataset export production <ファイル>.tar.gz`（戻すときは `sanity dataset import <ファイル> production --replace`）

## 8. Clerk・Stripe のダッシュボードの設定

どちらも、設定の変更の履歴が残らないものがある（人間が確かめる）。**変える前に、変える画面のスクリーンショットか値を控え、変えた日時と理由を issue に書く**。戻すときはその控えのとおりに手で戻す。

- Clerk: 本番インスタンスの設定（サインインの方法・Self Service Delete を無効のままにする等。`docs/ai-prompts/clerk.md`）・Webhook のエンドポイント。開発用インスタンスで先に試してから本番を変える
- Stripe: Price は消さず、使わなくなったら archive する（既存のサブスクリプションが参照するため）。Webhook のエンドポイント・送るイベントの種類・Customer Portal の設定は、テストモードで先に試してから live を変える。Webhook の署名の secret を作り直したら、Doppler の `STRIPE_WEBHOOK_SECRET` を変えて再デプロイする（5 章）

---

## 9. 関係者への連絡

| いつ             | 誰に                       | 何を                                                                       |
| ---------------- | -------------------------- | -------------------------------------------------------------------------- |
| 気付いてすぐ     | 開発チーム・運営者         | 起きていること・影響（購入・ログインができるか）・対応する人               |
| 影響があるなら   | クライアント（法人）       | 影響の範囲・戻す予定の時刻。会員への告知が要るかを相談する                 |
| 戻した・直した後 | 開発チーム・クライアント   | 戻した時刻・今の状態・原因と再発防止の予定（issue）                        |
| 会員に影響した   | 会員（クライアントと相談） | 決済・注文に影響した会員へ個別に。二重の決済等は Stripe で確かめて返金する |

- 連絡の窓口（Slack のチャンネル・クライアントの担当者）: （人間が記入）
- 対応した記録は issue に残す（時刻・行ったコマンド・判断の理由）。再発防止は CLAUDE.md の「レビューをすり抜けたバグはlint・テストに変換する」に従う

---

## stg で試した記録（2026-11-23）

Worker `brand-closed-ec-stg`、`wrangler` 4.166.0。

1. **事前**: スモークテスト 6 本が通った（9.9 秒）。出ていた版は `99a564d3`（E2E の後の `secret delete` の版）。1 つ前の `a1e815a5` は E2E 中の `DISABLE_EMAIL_SENDING` を入れた版で、コードは同じ（etag が同じ）。版を指定しない `wrangler rollback` だとここに戻る
2. **`wrangler rollback 32e7034f --message ...`**（1 つ前のデプロイの最後の版。コードは #658 のマージ時点）: 2.7 秒で `SUCCESS Worker Version 32e7034f... has been deployed to 100% of traffic.`。スモークテスト 6 本が通った（9.5 秒）
3. **ロールバック中の secret**: `wrangler secret put`・`secret bulk` が `Secret edit failed. ... the latest version of your Worker isn't currently deployed.` で失敗（exit 1）。`secret list` は 34 件（最新の版の一覧）、`versions view 32e7034f` の secret は 33 件（`CLERK_ADMIN_ORGANIZATION_ID` が無い）
4. **最新の版に戻す**: `wrangler rollback 99a564d3 --message ...` で 2.7 秒
5. **revert して再デプロイ**: `origin/develop` から一時的なブランチで #641 のマージを `git revert -m 1`（push はしていない）→ `pnpm build:cloudflare` 33 秒 → CI と同じ `secret bulk` ＋ `wrangler deploy` 21 秒で版 `c1ceb14d`（etag が変わった）。スモークテスト 6 本が通った（12.6 秒）
6. **develop を再デプロイ**: develop の最後の Deploy の実行の Deploy (staging) を Re-run（`gh run rerun <実行ID> --job <ジョブID>`）し、develop の先端のコードに戻した。Deploy (staging) 1 分 39 秒・続く E2E Tests (stg) 5 分 46 秒、どちらも成功
7. **ロールバック中のデプロイ**: `32e7034f` に戻した状態で、手元でビルドした develop の先端を `wrangler deploy` → 17 秒で通った（版 `3c3e67c7`。secret は最新の版の 34 件を引き継いだ）。その後 `secret bulk` も通った。もう一度戻した状態で `wrangler deploy --secrets-file /dev/stdin`（Doppler の `stg` を `filter-worker-env.jq` に通して渡す）も 17 秒で通り、出ている版 = 最新の版になった。スモークテスト 6 本が通った。最後に Deploy (staging) をもう一度 Re-run して CI のビルドに戻した
