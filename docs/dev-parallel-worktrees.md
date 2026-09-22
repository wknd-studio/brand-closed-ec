# 並列worktree実装の手引き

複数のissueを、1台のPC上で完全に分離した環境（別git worktree・別ポート・別ローカルSupabase）で、最大4並列で実装するための仕組み。

## 使い方

1. 並列させたい数だけClaude Codeセッションを別ウィンドウで立ち上げる
2. 各セッションで `/work-on-issue <issue番号>` を実行する
3. あとはセッションに任せる。環境構築（worktree作成・空きスロット検出・ポート調整・Supabase起動）から実装・テスト・push・PR作成までスキルが自走する
4. ユーザーがやることは「どのセッションにどのissueを割り振るか」の意思決定だけ

具体的な手順は `.claude/skills/work-on-issue/SKILL.md` を参照。このドキュメントは背景・制約のリファレンス。

## できること・できないこと

| 分離対象                                                           | 状態                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| ファイルシステム（git worktree、Claude Code標準の`EnterWorktree`） | 完全分離                                                                               |
| ローカルSupabase（Docker）                                         | 完全分離（`scripts/patch-supabase-slot.py`でスロットごとにポート・project_idをずらす） |
| Next.js/Playwrightの開発サーバーポート                             | 完全分離（`PORT`環境変数で可変）                                                       |
| Clerk・Stripe・Sanity                                              | **共有**（同じdevインスタンス・テストモードアカウントを全worktreeで使う）              |

Clerk/Sanityの固定テストID（メールアドレス・ブランド/商品ID）は`WORKTREE_SLOT`環境変数でスロットごとに一意化される（`tests/e2e/helpers/clerk-test-invitation.ts`の`slotEmail`/`withSlotSuffix`）。Stripeの決済イベントは全worktreeの`stripe listen`に転送されるため、他worktree宛てのイベントによる無害な404ログが出ることがある（実害なし）。

## スロット割り当て

| スロット | アプリポート | Supabase project_id       |
| -------- | ------------ | ------------------------- |
| 1        | 3000         | `brand-closed-ec`（既定） |
| 2        | 4000         | `brand-closed-ec-slot2`   |
| 3        | 5000         | `brand-closed-ec-slot3`   |
| 4        | 6000         | `brand-closed-ec-slot4`   |

同じスロット番号を2つのworktreeで同時に使わないこと（ポート・Dockerコンテナ名が衝突する）。稼働中のスロットは `docker ps` のコンテナ名（`-slotN`サフィックス）か `task worktree:list` で確認できる。

## 運用ルール

- **着手前**: `gh issue view 165` の依存グラフで、担当するissueの依存issueが完了しているか確認する
- **同時に走らせて安全な組み合わせ**: 依存グラフで枝分かれしているトラック（調達/返品/カタログ/会員機能の大半）は安全。`#200`（organizations削除）のような破壊的変更は単独で走らせる
- **マージ順の衝突**: 同じファイルを触るissue（`#224`と`#261〜264`など）は、同時に別worktreeで走らせず順番に処理する
- **push・PR**: `/work-on-issue`経由の実装に限り、テストがgreenになったらユーザー承認を待たずpush・PR作成まで進めてよい取り決め（通常の1対1のやり取りでは引き続き承認を待つ）

## Docker負荷の目安

既定（最小構成: api/db/authのみ、CIと同じ`-x`フラグ）なら1worktreeあたり2〜3コンテナ。4並列でも8〜12コンテナ程度に収まる。
