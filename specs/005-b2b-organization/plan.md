# Implementation Plan: 法人会員（B2B）対応

**Branch**: `005-b2b-organization` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-b2b-organization/spec.md`

## Summary

個人会員のみに対応している現行のClosed ECサイトに、Clerk Organizationsを用いた法人会員（B2B）対応を追加する。代表者はセルフサインアップ時に法人としての実体情報（会社名・代表者名・本店所在地・電話番号・適格請求書発行事業者登録番号）を入力して法人組織を作成し（`org:admin`）、追加の担当者（`org:member`）を招待できる。会員ランク・月次仕入れ上限は組織単位で合算管理し、一般担当者の発注は管理者の承認を経てから既存の決済・請求フローに進む。あわせて、現状パスワード以外の個人情報をほとんど収集していない個人会員のサインアップ導線にも、氏名・電話番号の必須入力を追加する（既存会員は次回ログイン時に遡及対応）。それ以外の個人会員の発注・住所管理・決済フローは変更しない。実装は既に移行完了済みのレイヤードアーキテクチャ（`src/domain/` `src/repositories/` `src/use-cases/` `src/infrastructure/`。`docs/architecture-refactoring.md`はその移行計画の記録であり、現状のディレクトリ命名規約とは一部異なる）の実際の規約に沿って行う。

## Technical Context

**Language/Version**: TypeScript (strict) / Next.js 16 App Router

**Primary Dependencies**: `@clerk/nextjs`（Organizations機能）、`supabase-js`、既存の（移行完了済みの）レイヤードアーキテクチャ（`src/domain/` `src/repositories/` `src/use-cases/` `src/infrastructure/`）

**Storage**: Supabase PostgreSQL（RLS）。新設テーブル `organizations` / `organization_memberships`、既存テーブル `orders` / `addresses` へのカラム追加

**Testing**: Vitest（ユニット・実DB統合テスト）、Playwright E2E。CLAUDE.mdの「テスト自動選択ルール」に従い、RLSポリシー・APIルート・Webhookハンドラーは統合テスト、承認判定・月次上限集計等の純粋ロジックはユニットテスト、法人サインアップ〜発注〜承認〜決済のクリティカルフローはE2E

**Target Platform**: Cloudflare Pages / Workers（`@cloudflare/next-on-pages`）

**Project Type**: Web service（既存Next.jsモノリスの拡張。フロントエンド/バックエンドの新規分離なし）

**Performance Goals**: 既存個人会員フローと同等（本機能による新規の性能目標なし）。FR-013により個人会員の体験・所要時間を劣化させないことが必須要件

**Constraints**: 個人会員の発注・住所管理・決済フローを変更しない（FR-013、プロフィール必須化を除く）／組織間のデータ越境アクセスを完全に遮断する（FR-014、RLSで保証）／承認待ちの注文は決済・請求を一切開始しない（FR-007）／既存会員データへの破壊的なDB制約追加は避ける（R7、アプリ層のゲートチェックで対応）

**Scale/Scope**: 新設テーブル2つ、既存テーブル2つ（`orders`/`addresses`）へのカラム追加、`users`テーブルへのカラム追加（`phone_number`等）、Clerk webhookイベント4種類の新規ハンドリング、UseCase層に6〜7個の新規ユースケース追加（組織関連 + プロフィール完了）、`middleware.ts`のゲートチェック拡張、Admin/Member双方に新規UI（組織メンバー管理・承認待ち一覧・プロフィール入力画面）、ランク参照を一元化する解決関数の新設と既存7箇所の置き換え（R11・FR-024）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Constitution原則Iにより、エンジニアリング制約はCLAUDE.mdを正とする。CLAUDE.mdの各ルールとの整合を確認する。

| ルール                                       | 判定      | 備考                                                                                                                                                    |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ブランチ戦略（`feature/*` → `develop`）      | ✅ PASS   | `feature/b2b-organization-support` として作業中、`develop`最新からworktree作成済み                                                                      |
| PRサイズ（差分200行以内・5ファイル以内）     | ⚠️ 要分割 | 本機能は単一PRに収まらない規模。`/speckit-tasks` で機能単位に細分化し、各タスクが独立してPRになるよう分割する（違反ではなく、タスク分割で解消する前提） |
| テスト自動選択ルール                         | ✅ PASS   | Technical Context参照。RLS変更・Webhook・APIルートは統合テスト必須                                                                                      |
| 実装順序（理解度確認→テスト→実装→コミット）  | ✅ PASS   | 各タスク実装時に踏襲する（`/speckit-tasks`生成物にも明記）                                                                                              |
| コミット形式（`feat(scope): BRAND-XX 説明`） | ⚠️ 保留   | Linear issue番号が必要。`/speckit-tasks`後、tasks-to-linearスキルでissue化してから実装着手する（Constitution 開発ワークフロー）                         |
| 事実の単一情報源化（原則V）                  | ✅ PASS   | `organizations.rank`は既存`MemberRank`型を再利用（R3）。ランク別上限額を複製しない                                                                      |
| 曖昧さの解消を計画より先に（原則III）        | ✅ PASS   | spec.mdの[NEEDS CLARIFICATION]は`/speckit-specify`段階でユーザーと協議し解消済み                                                                        |

**結論**: Constitution違反なし。PRサイズ・Linear issue化は`/speckit-tasks`フェーズで解消する前提のため、Complexity Trackingへの記載は不要（ルール逸脱ではなく後続フェーズへの委譲）。

## Project Structure

### Documentation (this feature)

```text
specs/005-b2b-organization/
├── plan.md              # このファイル
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   ├── server-actions.md
│   └── clerk-webhook-events.md
└── tasks.md              # Phase 2 output（/speckit-tasksで生成、このコマンドでは作成しない）
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── entities/
│   │   ├── organization.ts              # 新設: 組織集約（User集約と対称。ランク・月次期間）
│   │   └── user.ts                      # 既存を拡張: firstName/lastName/phoneNumberフィールドを追加（後述の既存不備の是正）
│   ├── value-objects/
│   │   └── approval-status.ts           # 新設: auto_approved/pending_approval/approved/rejected
│   ├── services/
│   │   ├── monthly-limit-service.ts     # 既存を拡張: 組織スコープの集計に対応
│   │   └── member-context-resolver.ts   # 新設: user.rank直接参照の一元化窓口（R11, FR-024）
│   └── errors/
│       ├── organization-errors.ts       # 新設: SoleAdminCannotLeaveError 等
│       └── invalid-invoice-registration-number-error.ts
│
├── repositories/
│   ├── organization-repository.ts               # 新設
│   ├── organization-membership-repository.ts     # 新設
│   └── user-repository.ts                        # 既存を拡張: firstName/lastName/phoneNumberの読み書きを追加
│
├── use-cases/                            # 既存はフラット構成（サブディレクトリなし）。本機能も同じ規約に合わせる
│   ├── create-organization.ts            # 新設: User Story 1
│   ├── invite-organization-member.ts     # 新設: User Story 3
│   ├── approve-order.ts                  # 新設: User Story 4
│   ├── reject-order.ts                   # 新設: User Story 4
│   ├── complete-profile.ts               # 新設: User Story 2（既存select-plan.tsが受け取りながら
│   │                                      #   永続化していなかったfirstName/lastNameの穴を埋める）
│   ├── withdraw.ts                       # 既存を拡張: 唯一のorg:adminである場合のブロック条件を追加（FR-017）
│   ├── select-plan.ts                    # 既存を拡張: 法人選択時はcreate-organizationに委譲
│   └── place-order.ts                    # 既存を拡張: 組織コンテキスト・承認待ち分岐・member-context-resolver経由への置き換え
│
├── lib/cart/monthly-confirmed.ts         # 既存を修正: user.rank直接参照 → member-context-resolver経由に置き換え（R11）
│
├── infrastructure/
│   ├── supabase/
│   │   ├── supabase-organization-repository.ts             # 新設
│   │   ├── supabase-organization-membership-repository.ts  # 新設
│   │   └── supabase-user-repository.ts                     # 既存を拡張: first_name/last_name/phone_numberのマッピング追加
│   └── clerk/
│       └── clerk-organization-gateway.ts  # 新設: createOrganization / inviteMember 等
│
├── middleware.ts                         # 既存を拡張: プロフィール未完了時のリダイレクト条件を追加（R7）
└── app/
    ├── (member)/
    │   ├── org/
    │   │   ├── members/                      # 新設: メンバー一覧・招待UI（org:admin向け）
    │   │   └── orders/pending/               # 新設: 承認待ち一覧・承認/却下UI（org:admin向け）
    │   ├── shop/page.tsx                     # 既存を修正: user.rank直接参照 → member-context-resolver経由に置き換え
    │   ├── shop/[brand]/page.tsx              # 同上
    │   ├── shop/[brand]/[id]/page.tsx         # 同上
    │   ├── shop/[brand]/actions.ts            # 同上
    │   └── order/checkout/page.tsx            # 同上
    ├── profile/complete/                 # 新設: プロフィール入力完了画面（個人・法人共通、User Story 2）
    └── api/webhooks/clerk/route.ts       # 既存を拡張: organization.*/organizationMembership.* を追加

supabase/migrations/
└── <timestamp>_add_organizations.sql     # organizations, organization_memberships新設 + orders/addresses/users拡張 + RLS

tests/
├── unit/
│   ├── organization-entity.test.ts               # 既存の user-entity.test.ts と同じ並び
│   ├── monthly-limit-service.test.ts              # 組織スコープケースを既存テストに追加
│   └── use-cases/
│       ├── create-organization.test.ts
│       ├── approve-order.test.ts
│       └── withdraw.test.ts                       # 唯一org:adminブロックのケースを既存テストに追加
└── integration/
    ├── use-cases/organization-scoped-orders.test.ts
    └── webhooks/clerk-organization-events.test.ts
```

**Structure Decision**: 既存のNext.js単一プロジェクト構成をそのまま踏襲する。`docs/architecture-refactoring.md` はレイヤードアーキテクチャへの移行"計画"を記した過去のドキュメントであり、**移行は既に完了済み**（`src/domain/` `src/repositories/` `src/use-cases/` `src/infrastructure/` が実在し稼働中）。同ドキュメントが提案していたディレクトリ名（`domain-services/`独立ディレクトリ、`use-cases/member/`等のロール別ネスト）と実際の構成（`domain/services/`、`use-cases/`直下フラット）は異なるため、本機能は**実際に存在するコードの規約**に合わせて実装する。新しいプロジェクト・パッケージの追加は行わない。

## Complexity Tracking

_Constitution違反なし。記載事項なし。_
