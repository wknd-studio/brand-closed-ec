# 並列worktree実装の手引き

複数のissueを、1台のPC上で完全に分離した環境（別git worktree・別ポート・別ローカルSupabase）で、最大4並列で実装するための基盤。

## できること・できないこと

| 分離対象                               | 状態                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| ファイルシステム（git worktree）       | 完全分離                                                                  |
| ローカルSupabase（Docker）             | 完全分離（本仕組みで対応）                                                |
| Next.js/Playwrightの開発サーバーポート | 完全分離（本仕組みで対応）                                                |
| Clerk・Stripe・Sanity                  | **共有**（同じdevインスタンス・テストモードアカウントを全worktreeで使う） |

Clerk/Sanityの固定テストID（メールアドレス・ブランド/商品ID）は`WORKTREE_SLOT`環境変数でスロットごとに一意化される（`tests/e2e/helpers/clerk-test-invitation.ts`の`slotEmail`/`withSlotSuffix`）。Stripeの決済イベントは全worktreeの`stripe listen`に転送されるため、他worktree宛てのイベントによる無害な404ログが出ることがある（実害なし）。

## 使い方

```bash
# worktree作成（issue番号226、スロット2）
task worktree:new -- 226 2

# VS Codeで開く
code ../wt-226

# そのworktree内で
task test:integration:worktree   # スロット専用のSupabaseに対して統合テスト
task test:e2e:worktree           # スロット専用のポート・Supabaseに対してE2Eテスト

# 片付け（Supabase停止 + worktree削除）
task worktree:teardown -- 226
```

## スロット割り当て

| スロット | アプリポート | Supabase project_id       | 備考                             |
| -------- | ------------ | ------------------------- | -------------------------------- |
| 1        | 3000         | `brand-closed-ec`（既定） | メインの作業用worktreeで使う想定 |
| 2        | 4000         | `brand-closed-ec-slot2`   |                                  |
| 3        | 5000         | `brand-closed-ec-slot3`   |                                  |
| 4        | 6000         | `brand-closed-ec-slot4`   |                                  |

同じスロット番号を2つのworktreeで同時に使わないこと（ポート・Dockerコンテナ名が衝突する）。`task worktree:list`で使用中のworktree一覧を確認できる。

## 内部の仕組み

- `scripts/patch-supabase-slot.py`: そのworktree自身の`supabase/config.toml`のポート・`project_id`をスロット番号に応じて書き換える。書き換え後は`git update-index --skip-worktree`で、誤ってこのローカル専用変更をコミットしないようにする
- `scripts/worktree-setup.sh`: worktree作成→config.toml書き換え→`pnpm install`→`supabase start`（既定ではCIと同じ最小構成: api/db/authのみ。`--full`でStudio等を含むフルスタック）→`supabase db reset`→`.env.worktree`生成までを1コマンド化
- `playwright.config.ts`: `PORT`環境変数でアプリポートを可変にし、`WORKTREE_SLOT`が設定されている場合は`pnpm dev`（内部でdoppler runをネストする）を避け、CIと同じ理由で素の`next dev`を使う

## Docker負荷の目安

既定（最小構成: api/db/auth）なら1worktreeあたり2〜3コンテナ。4並列でも8〜12コンテナ程度に収まる。`--full`（Studio等含む）を使う場合は1worktreeあたり8〜10コンテナに増えるため、並列数はマシンのCPU/メモリと相談すること。
