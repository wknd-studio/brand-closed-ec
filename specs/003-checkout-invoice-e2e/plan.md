# Implementation Plan: カタログ〜チェックアウト・決済確定フローのE2Eテスト網羅

**Branch**: `003-checkout-invoice-e2e` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-checkout-invoice-e2e/spec.md`

## Summary

実際のカタログ画面・チェックアウト画面・Stripe Checkout画面を操作するE2Eテストを新規追加する。会員が固定価格商品を購入する導線（User Story 1: カタログ→カート→チェックアウト→決済→`paid`。住所の新規入力・既存選択の両経路、月次上限超過時のブロックも含む）と、要相談商品の見積依頼導線（User Story 2: カタログ→カート→チェックアウト→`/order/invoice-complete`）を、それぞれ独立したPRで実装する。`specs/002-e2e-auth-coverage`で確立したパターン（招待経由の実登録、固定テストアカウント、`+clerk_test`メール規約、`cleanupTestUser`ヘルパー）を踏襲する。

## Technical Context

**Language/Version**: TypeScript, Playwright Test

**Primary Dependencies**: `@clerk/testing`（`setupClerkTestingToken`）、`@clerk/backend`（招待作成・クリーンアップ。`tests/e2e/helpers/clerk-test-invitation.ts`を再利用）、`@supabase/supabase-js`（住所の事前準備・注文ステータスの検証）

**Storage**: Supabase PostgreSQL（テストで作成した会員・住所・注文レコードのクリーンアップ対象）、Sanity（既存の商品データを読み取り専用で使用。新規作成はしない）

**Testing**: Playwright（E2E）。CLAUDE.mdの基準で「クリティカルな業務フロー全体」に該当するため既存のE2E層に追加する

**Target Platform**: ローカル実行（`pnpm dev`自動起動）・CI（`e2e-pr`ジョブ内でのローカルSupabase実行）の両方で動作する必要がある

**Project Type**: 既存Webアプリケーションへの自動テスト追加（プロダクトコードの変更なし）

**Performance Goals**: User Story 1（住所新規入力・既存選択・上限超過の3シナリオ）＋User Story 2（1シナリオ）で、CI実行時間の増加を数分程度に抑える

**Constraints**: Stripe Checkout画面はClerkと同様に外部ホスト画面のため、テストカード（`4242424242424242`）での実際の決済操作が必要。Stripe webhookの処理完了は非同期のため、注文ステータスの検証にはポーリングが必要になる見込み。ローカル/CIともに`stripe listen --forward-to`によるWebhook転送が実行中でないと、決済完了後の状態変化が一切反映されない（T001実機確認済み。ローカルは`task dev`で対応済み、CIの`e2e-pr`ジョブには本featureで追加した）

**Scale/Scope**: `tests/e2e/order/`配下に新規スペックファイルを追加。既存の`tests/e2e/auth/`・`tests/e2e/helpers/`は変更しない（`clerk-test-invitation.ts`は再利用のみ）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原則                            | 確認内容                                                                                                                               | 判定    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| I. CLAUDE.mdを正とする          | 「クリティカルな業務フロー全体→E2Eテスト」に該当。ブランチ・PRサイズ規律に従い、User Storyごとに独立したPRとする                       | ✅ PASS |
| II. 受け入れ条件の明記          | spec.mdは「会員が確認できること」「システムが保証すること」の2区分で明記済み                                                           | ✅ PASS |
| III. 曖昧さの解消を計画より先に | 住所の新規入力・既存選択の両経路、注文ステータスの検証方法（DB直接照会）、請求書発行時の上限チェックの扱いはユーザーとの対話で解消済み | ✅ PASS |
| IV. 実装記述と仕様意図の区別    | 本featureはテストの追加のみで、プロダクトの実装・仕様記述ドキュメントは変更しない                                                      | ✅ PASS |
| V. 事実の単一情報源化           | 該当なし（新しいビジネス上の事実は発生しない）                                                                                         | ✅ PASS |

## Project Structure

### Documentation (this feature)

```text
specs/003-checkout-invoice-e2e/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

### Source Code（変更・追加対象の実ファイル）

```text
tests/e2e/
├── global.setup.ts                  # 既存。変更なし
├── helpers/
│   └── clerk-test-invitation.ts     # 既存。変更なし（再利用のみ）
├── auth/                            # 既存。変更なし
│   ├── onboarding.spec.ts
│   ├── registration.spec.ts
│   └── login.spec.ts
└── order/
    ├── checkout.spec.ts             # 新規。User Story 1（固定価格商品の決済確定・住所2経路・上限超過）
    └── invoice.spec.ts              # 新規。User Story 2（要相談商品の見積依頼）
```

**Structure Decision**: 新規ディレクトリ`tests/e2e/order/`を作り、注文関連のE2Eテストを`auth/`と分離する。招待作成・クリーンアップは既存の`tests/e2e/helpers/clerk-test-invitation.ts`をそのまま再利用し、新規ヘルパーは作らない（住所の事前準備・注文ステータスの検証はSupabaseクライアントを各specファイル内で直接使う。既存の`tests/e2e/auth/onboarding.spec.ts`・統合テスト群と同じパターン）。

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

該当なし。
