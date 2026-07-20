# Implementation Plan: 会員登録・ログインフローのE2Eテスト網羅

**Branch**: `002-e2e-auth-coverage` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-e2e-auth-coverage/spec.md`

## Summary

実際の登録画面・ログイン画面（メールアドレス・パスワード入力、Clerkの確認コード／2段階認証コード入力）を操作するE2Eテストを新規追加する。招待コード発行はClerkの公式バックエンドAPI（`invitations.createInvitation`。管理画面が内部で使っているものと同じ）をテストの事前準備として直接呼び出し、レスポンスの`url`フィールドへ直接遷移することで、実際のメール受信を経由せずに招待リンククリック後の状態を再現する。既存の`tests/e2e/auth/onboarding.spec.ts`（チケット方式バイパス）はそのまま残す。

## Technical Context

**Language/Version**: TypeScript, Playwright Test

**Primary Dependencies**: `@clerk/testing`（`setupClerkTestingToken`によるボット対策バイパス）、`@clerk/backend`（`clerkClient`。招待作成・テストユーザークリーンアップ用）、既存の`@supabase/supabase-js`

**Storage**: Supabase PostgreSQL（テストで作成した会員レコードのクリーンアップ対象）、Clerk（テストユーザー・招待のクリーンアップ対象）

**Testing**: Playwright（E2E）。CLAUDE.mdの基準で「クリティカルな業務フロー全体」に該当するため既存のE2E層に追加する

**Target Platform**: ローカル実行（`pnpm dev`自動起動）・CI（`e2e-pr`ジョブ内でのローカルSupabase実行）の両方で動作する必要がある

**Project Type**: 既存Webアプリケーションへの自動テスト追加（プロダクトコードの変更なし）

**Performance Goals**: 6ランク分の登録テスト＋ログインテストで、CI実行時間の増加を数分程度に抑える（並列実行を検討）

**Constraints**: Googleの実際のOAuth画面のような「テスト不能な第三者UI」は対象外（本featureはメール＋パスワード＋メール2段階認証のみ）。Clerkのテスト用メール規約（`+clerk_test`を含むアドレス、固定コード`424242`）に依存する

**Scale/Scope**: `tests/e2e/auth/`配下に新規スペックファイルを追加。既存ファイルは変更しない

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原則                            | 確認内容                                                                                                               | 判定    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| I. CLAUDE.mdを正とする          | 「クリティカルな業務フロー全体→E2Eテスト」に該当。ブランチ・PRサイズ規律に従う                                         | ✅ PASS |
| II. 受け入れ条件の明記          | spec.mdは「会員が確認できること」「システムが保証すること」の2区分で明記済み                                           | ✅ PASS |
| III. 曖昧さの解消を計画より先に | ビジネスサイドとの合意は不要（社内テスト整備）と確認済み。招待発行方法という技術的な疑問点はユーザーとの対話で解消済み | ✅ PASS |
| IV. 実装記述と仕様意図の区別    | 本featureはテストの追加のみで、プロダクトの実装・仕様記述ドキュメントは変更しない                                      | ✅ PASS |
| V. 事実の単一情報源化           | 該当なし（新しいビジネス上の事実は発生しない）                                                                         | ✅ PASS |

## Project Structure

### Documentation (this feature)

```text
specs/002-e2e-auth-coverage/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

### Source Code（変更・追加対象の実ファイル）

```text
tests/e2e/
├── global.setup.ts                  # 既存。変更なし（clerkSetup()のみ）
├── helpers/
│   └── clerk-test-invitation.ts     # 新規。招待作成・テストユーザークリーンアップの共通処理
└── auth/
    ├── onboarding.spec.ts           # 既存。チケット方式。変更なし
    ├── registration.spec.ts         # 新規。6ランク分の実登録フローテスト（User Story 1）
    └── login.spec.ts                # 新規。実ログイン＋メール2段階認証テスト（User Story 2）
```

**Structure Decision**: 新規ディレクトリ`tests/e2e/helpers/`を作り、招待作成・クリーンアップ処理を共通化する（`registration.spec.ts`と`login.spec.ts`の両方が「テスト用会員を作る」処理を必要とするため）。既存の`tests/e2e/auth/`構成はそのまま踏襲する。

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

該当なし。
