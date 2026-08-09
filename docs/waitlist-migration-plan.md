# Clerk Waitlistへの移行計画

## 背景・目的

現在は`Restricted` signup mode（管理者が`/admin/invitations`からメールアドレスを直接指定して招待しない限りサインアップ不可）。この方式は会員数の増加がすべて管理者の能動的な招待に依存しており、サービス自体への需要を自然に取り込めない。

管理者による審査は維持したまま、ユーザー側から自発的に登録希望を出せるようにするため、Clerkの**Waitlist**機能に切り替える。ユーザーがメールアドレスで参加希望を送信 → 管理者が一覧から承認/却下 → 承認されたら現行の`/sign-up`以降のフロー（Legal Consent同意・パスワード設定・オンボーディング）へ進む。

**決定事項**: 既存の「管理者が直接メールアドレスを指定して招待する」機能（`/admin/invitations`）は完全に廃止し、Waitlist経由の承認フローに一本化する（並存させない）。

## Clerk Waitlist機能の仕様（2026年時点、公式ドキュメント確認済み）

- **有効化**: Clerk Dashboardの「Waitlist」設定でトグルON（Restricted/Public/Waitlistは排他的なsignup mode。コード変更不要）
- **ユーザー側**: `<Waitlist />`コンポーネント（`@clerk/nextjs`）を置いた公開ページでメールアドレスを送信。アカウントは作られず、`pending`状態の`waitlistEntry`が1件作成される
- **管理者側 Backend API**（`clerkClient.waitlistEntries`、`@clerk/nextjs/server`の`clerkClient()`経由）:
  - `list({ status: "pending", limit, offset, query })` — 一覧取得
  - `invite(waitlistEntryId)` — 承認して招待メール送信。ステータスが`invited`になる
  - `reject(waitlistEntryId)` — 却下
  - `create({ emailAddress })` / `bulkCreate(...)` — 管理者側からの直接登録（今回は使わない想定）
  - `delete(waitlistEntryId)` — pending中の登録を削除
- **承認後のフロー**: `invite()`が送るメールのリンク以降は、既存の`/sign-up?__clerk_ticket=...`フロー（Legal Consent同意→パスワード設定→`user.created` Webhook→`/onboarding/account-type`）と**完全に同一**。変更は招待の起点のみ

Sources:

- https://clerk.com/docs/nextjs/reference/components/authentication/waitlist
- https://clerk.com/docs/nextjs/guides/development/custom-flows/authentication/waitlist
- https://github.com/clerk/clerk-sdk-python/blob/main/docs/sdks/waitlistentriessdk/README.md

## ⚠️ 未検証・実装前に必ず確認すること

**Waitlist mode有効化後も`clerk.invitations.createInvitation()`が引き続き機能するか**が未確認。理由: `tests/e2e/helpers/clerk-test-invitation.ts`の`createTestInvitation()`が、ほぼ全てのE2Eテスト（`registration.spec.ts`・`checkout.spec.ts`・`invoice.spec.ts`・`organization-signup.spec.ts`・`onboarding.spec.ts`等）から呼ばれており、テスト用ユーザー作成の基盤になっている。

- もし引き続き機能する（＝招待は一般のsignup mode設定を上書きする、というのがClerkでよくあるパターン）→ E2Eテストヘルパーは変更不要
- もし機能しなくなる場合 → `createTestInvitation()`を`waitlistEntries.create()` + `waitlistEntries.invite()`経由で招待URLを取得する方式に書き換える必要がある（影響範囲が広いため優先的に検証する）

検証方法: 開発環境のClerk DashboardでWaitlistを試験的にONにし、既存の`POST /api/admin/invitations`（またはPlaywrightテストの`createTestInvitation`）を1回実行してエラーにならないか確認する。

## 現状の実装（置き換え対象）

- `src/app/admin/invitations/page.tsx` — 管理者向け招待管理画面（メールアドレス入力フォーム＋招待一覧＋取り消しボタン）
- `src/app/api/admin/invitations/route.ts` — `GET`（一覧）/`POST`（`createInvitation`で招待作成）/`DELETE`（`revokeInvitation`で取り消し）
- `tests/e2e/helpers/clerk-test-invitation.ts` — `createTestInvitation()`, `revokePendingInvitationsForEmail()`, `signUpViaInvitation()`ほか。E2Eテスト全体のユーザー作成基盤
- `docs/signup-flow.md` — フェーズ1（招待送信）・フェーズ2（サインアップ）の図・説明

## タスク一覧

- [x] T1 **[検証・最優先]** Waitlist mode有効化後も`clerk.invitations.createInvitation()`が機能するか確認する（開発環境で試験的にON→既存の招待APIを1回実行）。機能しない場合は後続タスクの設計を修正する
  - 検証結果: 引き続き機能する（エラーなくpending状態の招待が作成された）。E2Eヘルパーは変更不要と判明
- [x] T2 `git fetch origin develop`して`feature/waitlist-signup`ブランチを作成する
- [x] T3 Clerk Dashboard（開発環境）でサインアップモードを`Restricted`→`Waitlist`に切り替える（手動設定、コード変更なし）
- [x] T4 公開ページ`src/app/waitlist/page.tsx`を新設し`<Waitlist />`コンポーネントを配置する
- [x] T5 トップページ・ヘッダー等、`/sign-up`への直接リンクを洗い出し`/waitlist`に差し替える（`grep -rn "/sign-up" src/app`で洗い出す）
  - 差し替え対象の直接リンクは無かった（廃止予定の`admin/invitations/route.ts`のredirectUrlのみ）。代わりに`/waitlist`を`middleware.ts`の公開ルートに追加
- [x] T6 `src/app/api/admin/waitlist/route.ts`を新設する: `GET`で`waitlistEntries.list({status:"pending"})`、`POST`で`waitlistEntries.invite(id)`（承認）、`DELETE`で`waitlistEntries.reject(id)`（却下）。`requireAdmin()`パターンは既存の`admin/invitations/route.ts`を踏襲
- [x] T7 `src/app/admin/waitlist/page.tsx`を新設する: 承認待ち一覧表示＋承認/却下ボタン（既存の`admin/invitations/page.tsx`のテーブルUIパターンを踏襲、メールアドレス入力フォームは不要）
- [x] T8 旧`src/app/admin/invitations/`・`src/app/api/admin/invitations/`を削除する。管理画面ナビゲーション等の参照を`/admin/waitlist`に更新する
- [x] T9 `tests/e2e/helpers/clerk-test-invitation.ts`を更新する（T1の検証結果次第で対応が変わる。機能しなくなる場合は`waitlistEntries`経由に書き換え）
  - T1の検証結果により変更不要と確認
- [x] T10 Unit/Integration test: `/api/admin/waitlist`の権限チェック・承認・却下のテストを追加する
- [x] T11 E2Eテスト: `/waitlist`ページからの参加希望送信〜管理者承認〜サインアップ完了までのシナリオを追加する
  - 検証範囲を「参加希望送信〜管理者承認による招待URL発行」までに縮小。`waitlistEntries.invite()`は`createInvitation()`と異なりredirectUrlを指定できず招待リンクが必ずClerkホスト型ページを経由するため、`setupClerkTestingToken`との相性が悪く自動操作が安定しなかった。招待URL以降（ホスト型ページでのサインアップ完了〜自社アプリ復帰）は`createInvitation`経由の既存E2E（`registration.spec.ts`等）と同一コードパスのためカバー対象外とし、手動ブラウザ操作で`/onboarding/account-type`到達まで確認済み（詳細は`docs/signup-flow.md`の設計決定事項#13）
- [x] T12 `docs/signup-flow.md`のフェーズ1（招待送信）・フェーズ2（サインアップ）をWaitlistベースの図に書き換える
- [x] T13 `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm test:integration`を通す
- [x] T14 コミット・プッシュ・PR作成（`develop`向け、ユーザーの明示承認後）
  - PR #144: https://github.com/wknd-studio/brand-closed-ec/pull/144

## 実装順序の注意

CLAUDE.mdの実装順序（理解度確認→テストを書く→失敗を確認→実装→テスト通過確認→コミット）に従う。T1の検証結果でT9の設計が変わるため、T1は他のタスクより先に着手すること。
