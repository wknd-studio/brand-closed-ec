# クローズドECサイト 要件定義書

**バージョン**: 1.0.0  
**作成日**: 2026-05-07  
**ステータス**: Draft

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術スタック](#2-技術スタック)
3. [環境構成](#3-環境構成)
4. [Gitブランチ戦略](#4-gitブランチ戦略)
5. [CI/CDパイプライン](#5-cicdパイプライン)
6. [Linear連携](#6-linear連携)
7. [データベース設計方針](#7-データベース設計方針)
8. [認証・認可設計](#8-認証認可設計)
9. [セキュリティ要件](#9-セキュリティ要件)
10. [決済設計](#10-決済設計)
11. [CMS設計](#11-cms設計)
12. [テスト戦略](#12-テスト戦略)
13. [環境変数管理](#13-環境変数管理)
14. [MVPスコープ（フェーズ定義）](#14-mvpスコープフェーズ定義)
15. [運用コスト見積もり](#15-運用コスト見積もり)

---

## 1. プロジェクト概要

### 1-1. サービス定義

招待を受けた特定の会員のみが利用できる「クローズドECサイト」を構築する。一般公開はせず、未認証のアクセスに対してはサイトの存在自体を秘匿する。ブランドの希少性と会員の「特権意識」を技術的に担保することが最大の要件である。

### 1-2. MVPのゴール

```
招待コード受領 → 会員登録 → 商品閲覧 → カート → 購入完了
```

この一本道のフローを14週で完成させる。会員ランク（Free / Entry / Standard / Pro / Enterprise）による閲覧権限の差異化をフェーズ2で実装する。

### 1-3. 対象ユーザー

- **会員（エンドユーザー）**: 招待された特定個人。スマートフォン中心での利用を想定。
- **運営者（管理者）**: 会員・商品・在庫・注文を管理する社内担当者。
- **顧客（クライアント）**: dev/stg環境でデプロイを動作確認するプロジェクト発注者。

---

## 2. 技術スタック

### 2-1. 採用技術一覧

| レイヤー           | 採用技術                   | バージョン | 採用理由                                                                           |
| ------------------ | -------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| **フロントエンド** | Next.js (App Router)       | 16.x       | `middleware.ts`による境界防御、RSCによる高速描画                                   |
| **言語**           | TypeScript                 | 5.x        | strict モードで型安全性を最大化                                                    |
| **認証・認可**     | Clerk                      | 最新安定版 | Next.jsとの深い統合、RBAC標準搭載、招待ロジック拡張が容易                          |
| **データベース**   | Supabase (PostgreSQL)      | —          | RLSによるデータレベル認可、ACIDトランザクション                                    |
| **決済**           | Stripe Checkout            | —          | SAQ A準拠（外部リダイレクト型）、カード情報が自社サーバーを通過しない              |
| **CMS**            | Sanity v3                  | —          | スキーマをコードで管理、構造化データとしてAI連携に対応                             |
| **検索**           | Algolia                    | —          | 高速な商品検索（MVP段階はキーワード検索のみ）                                      |
| **ホスティング**   | Cloudflare Pages + Workers | —          | 無料帯域幅、Edge Runtime、WAF・CDN組み込み済み。Vercelと比較してコストが大幅に低い |
| **タスク管理**     | Linear                     | —          | GitHubとの自動連携でPR・チケットを紐付け                                           |
| **バージョン管理** | GitHub                     | —          | Cloudflare Pages・Linearと三角連携                                                 |
| **E2Eテスト**      | Playwright                 | 最新安定版 | クリティカルパスの自動検証                                                         |
| **エラー監視**     | Sentry                     | —          | 全環境でエラー・パフォーマンスを監視                                               |

### 2-2. 採用しない技術（MVP外）

| 技術                         | 理由                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| LINEミニアプリ               | LINE審査コスト・期間がMVPのTTMを圧迫するため。フェーズ4以降で追加。 |
| OpenAI APIレコメンデーション | 商品データが揃う前に実装しても効果が出ないため。フェーズ4以降。     |
| BNPL（Paidy等）              | MVP段階では決済オプションを最小化。フェーズ4以降。                  |
| PWA                          | iOS環境での機能制限が解消されていないため見送り。                   |
| ネイティブアプリ             | アプリ疲労とストア審査リスクを回避。Web優先。                       |

---

## 3. 環境構成

### 3-1. 環境一覧

| 環境     | 対応ブランチ | アクセス先                   | 利用者       | 主な用途                                             |
| -------- | ------------ | ---------------------------- | ------------ | ---------------------------------------------------- |
| **dev**  | `feature/*`  | `http://localhost:3000`      | 開発者のみ   | ローカルで `npm run dev` を起動して機能を単体確認。  |
| **stg**  | `develop`    | `https://stg.<ドメイン>.com` | 開発者・顧客 | テストデータで本番同等の操作を検証。顧客の最終確認。 |
| **prod** | `main`       | `https://<ドメイン>.com`     | 会員・運営者 | 実際のビジネスデータで稼働する本番サービス。         |

> **顧客の動作確認フロー**: develop へのマージ → stg に自動デプロイ → stg URL を共有して確認。feature ブランチ単位での共有は行わない。

### 3-2. 環境ごとのサービス分離

認証・DB・決済を環境ごとに独立させることで、stgでのテスト操作がprodデータを汚染するリスクをゼロにする。

| サービス     | dev（ローカル）                                      | stg                          | prod                         |
| ------------ | ---------------------------------------------------- | ---------------------------- | ---------------------------- |
| **Supabase** | ローカル Docker（`127.0.0.1:54321`）                 | 専用 `stg` プロジェクト      | 専用 `prod` プロジェクト     |
| **Clerk**    | Development インスタンス（stg と共用）               | Development インスタンス     | Production インスタンス      |
| **Stripe**   | テストモード (`sk_test_...`)                         | テストモード (`sk_test_...`) | ライブモード (`sk_live_...`) |
| **Sanity**   | `staging` データセット（stg と共用・無料プラン制限） | `staging` データセット       | `production` データセット    |
| **Sentry**   | `dev` 環境タグ                                       | `stg` 環境タグ               | `prod` 環境タグ              |

> **Clerk の共用について**: Clerk の無料プランおよび小規模構成では dev と stg で同一の Development インスタンスを使用する。prod のみ独立した Production インスタンスで完全分離する。

> **Sanity の共用について**: Sanity 無料プランはデータセット2つまでのため、`staging`（dev/stg 共用）と `production` の2つで運用する。ローカルでの開発作業で作成したコンテンツが stg に反映される点に注意する。

### 3-3. Cloudflare Pagesプロジェクト構成

```
GitHub リポジトリ: brand-closed-ec
  │
  ├─ CF Pages Project: brand-closed-ec-prod
  │   └─ Production Branch: main → https://<ドメイン>.com
  │
  └─ CF Pages Project: brand-closed-ec-stg
      └─ Production Branch: develop → https://stg.<ドメイン>.com
```

> **なぜ2プロジェクト構成か**: Cloudflare Pagesの「Production Branch」はプロジェクトにつき1本のため、prodとstgに独立したカスタムドメインを割り当てるには2プロジェクトが必要。

> **Next.jsとCloudflareの互換性**: `@cloudflare/next-on-pages` パッケージを使用してNext.jsアプリをCloudflare Pages Functions形式に変換する。**Edge Runtimeのみ対応**（Node.jsランタイムは使用不可）。ただし使用するサービス（Clerk、Supabase JS Client、Stripe）はすべてEdge Runtime対応済み。

### 3-4. stg環境の運用注意事項

stg は開発者とクライアント（顧客）が同じデータを共用する環境のため、以下の操作は事前に顧客へ確認・告知してから実施する。

| 操作                                      | stg への影響                                 | 対応                           |
| ----------------------------------------- | -------------------------------------------- | ------------------------------ |
| `develop` へのコードマージ                | アプリが再デプロイされるのみ                 | 通知不要                       |
| Supabase マイグレーションを stg に適用    | スキーマ変更（既存データに影響する場合あり） | 顧客が使っていない時間帯に実施 |
| stg のシードデータをリセット              | テストデータが上書きされる                   | 事前に顧客へ告知必須           |
| Sanity でコンテンツを編集（ローカルでも） | `staging` データセットに即反映 → stg に反映  | 大きな変更は告知推奨           |

> **基本方針**: コードの変更はいつでも deploy して問題ない。データそのものを操作する場合だけ顧客と調整する。

---

## 4. Gitブランチ戦略

### 4-1. ブランチ構成（Gitflow）

```
main         ────────────────────────────────────────────▶  prod
               ↑ PR (develop → main)
develop      ────────────────────────────────────────────▶  stg（自動デプロイ）
               ↑ PR (feature → develop)
feature/*    ────────────────────────────────────────────▶  ローカル（localhost）で動作確認
hotfix/*     ──▶ main（緊急修正後、developへバックマージ必須）
```

### 4-2. ブランチ命名規則

| ブランチ種別 | 命名規則                            | 例                                  |
| ------------ | ----------------------------------- | ----------------------------------- |
| 機能開発     | `feature/<linear-ticket-id>-<slug>` | `feature/BRAND-42-invitation-code`  |
| 緊急修正     | `hotfix/<linear-ticket-id>-<slug>`  | `hotfix/BRAND-99-fix-auth-redirect` |
| リリース     | `release/<version>`                 | `release/1.0.0`（必要時のみ）       |

### 4-3. PRルールとレビューポリシー

| PR方向              | 必須レビュー数 | CI条件           | 追加条件                    |
| ------------------- | -------------- | ---------------- | --------------------------- |
| `feature → develop` | 1名以上        | 全CIグリーン必須 | —                           |
| `develop → main`    | 2名以上        | 全CIグリーン必須 | stgでのQA完了を確認         |
| `hotfix → main`     | 1名以上        | 全CIグリーン必須 | 即座にdevelopへバックマージ |

### 4-4. コミット・PRメッセージ規約（Conventional Commits）

```
<type>(<scope>): <summary>

type: feat | fix | refactor | test | docs | chore | security
scope: auth | product | cart | payment | cms | infra | e2e

例:
feat(auth): BRAND-42 招待コード検証ロジックの実装
fix(payment): BRAND-99 Stripe Webhookのシグネチャ検証エラーを修正
security(proxy): 未認証アクセスのシャットアウト実装
```

---

## 5. CI/CDパイプライン

### 5-1. 全体フロー

```
開発者が feature/* ブランチへ push → ローカルで動作確認
  │
  └─ [GitHub Actions] CI起動（pull_request 時）
      │
      ├─ [並列実行]
      │   ├─ TypeScript型チェック (tsc --noEmit)
      │   ├─ ESLint (--max-warnings 0)
      │   └─ Prettier フォーマットチェック
      │
      └─ [型チェック通過後]
          └─ Playwright E2Eテスト（stg環境に対して実行）

全CIグリーン → PR マージ可能
feature → develop マージ → stg へ自動デプロイ（〜3分）
develop → main マージ → prod へ自動デプロイ（〜3分）
```

### 5-2. GitHub Actionsワークフロー構成

```
.github/
└── workflows/
    ├── ci.yml            # 型チェック・Lint・Prettier（全PR）
    ├── e2e.yml           # Playwright E2E（全PR、stg環境で実行）
    └── notify-linear.yml # PRマージ時にLinearチケットのステータスを更新
```

#### `ci.yml` の概要

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npm run typecheck # tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npm run lint # eslint + prettier --check
```

#### `e2e.yml` の概要

```yaml
name: E2E
on:
  pull_request:
    branches: [main, develop]

jobs:
  playwright:
    runs-on: ubuntu-latest
    needs: [typecheck, lint] # CI通過後に実行
    env:
      BASE_URL: ${{ secrets.STG_BASE_URL }}
      # E2E用テストアカウント（stg Clerk）
      TEST_MEMBER_EMAIL: ${{ secrets.TEST_MEMBER_EMAIL }}
      TEST_MEMBER_PASSWORD: ${{ secrets.TEST_MEMBER_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### 5-3. ブランチ保護ルール（GitHub Settings）

**`main` ブランチ**:

- Require a pull request before merging
- Required approvals: 2
- Require status checks: `ci/typecheck`, `ci/lint`, `ci/e2e`, `cloudflare-pages`
- Restrict pushes: 直接pushを禁止（hotfixもPR経由）

**`develop` ブランチ**:

- Require a pull request before merging
- Required approvals: 1
- Require status checks: `ci/typecheck`, `ci/lint`, `ci/e2e`

### 5-4. デプロイ所要時間の目標

| イベント     | デプロイ先     | 目標時間 |
| ------------ | -------------- | -------- |
| develop push | stg.domain.com | 〜3分    |
| main push    | domain.com     | 〜3分    |

---

## 6. Linear連携

### 6-1. プロジェクト構成

| 設定項目           | 値                                                  |
| ------------------ | --------------------------------------------------- |
| プロジェクト識別子 | `BRAND`                                             |
| スプリントサイクル | 2週間                                               |
| ワークフロー       | `Backlog → Todo → In Progress → In Review → Done`   |
| ラベル             | `feature`, `bug`, `security`, `infra`, `cms`, `e2e` |

### 6-2. GitHub連携フロー

```
1. Linear でチケット作成 → ID発行（例: BRAND-42）

2. 開発者がブランチ作成
   git checkout -b feature/BRAND-42-invitation-code

3. PR作成
   タイトル: "feat(auth): BRAND-42 招待コード検証ロジックの実装"
   → Linear が PR タイトルの "BRAND-42" を自動認識
   → Linear チケットに PR リンクが自動付与
   → ステータスが "In Progress" → "In Review" へ自動遷移

4. PR マージ（notify-linear.yml が実行）
   → Linear チケットのステータスが "Done" へ自動遷移
```

### 6-3. `notify-linear.yml` の概要

```yaml
name: Notify Linear
on:
  pull_request:
    types: [closed]
    branches: [develop, main]

jobs:
  update-linear:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Update Linear issue status
        uses: linear-actions/linear-close-issue@v1
        with:
          api-key: ${{ secrets.LINEAR_API_KEY }}
          # PRタイトルから BRAND-XX を抽出して該当チケットをDoneに更新
```

---

## 7. データベース設計方針

### 7-0. スキーマ変更方針（マイグレーション）

テーブル構造は最初から完璧に定義する必要はない。Supabaseが提供するマイグレーション機能を使い、開発の進行に合わせて列・テーブルを追加・変更していく。変更は必ずマイグレーションファイルとしてGit管理し、dev→stg→prodの順に適用する。

| 操作               | 対応方針                                              |
| ------------------ | ----------------------------------------------------- |
| 列・テーブルの追加 | マイグレーションファイルを作成してそのまま適用        |
| 列名・型の変更     | アプリコードと同時に変更。stgで動作確認後にprodへ適用 |
| 列・テーブルの削除 | データ消失リスクあり。バックアップ確認後に実施        |

### 7-1. データモデル

> **参照先**: エンティティ定義・ER図・スナップショット設計・月次上限算出ロジックは **`docs/data-model.md`** を唯一の設計根拠とすること。ここでは概要のみを記載する。

**会員ランク**: `free` / `entry` / `standard` / `pro` / `enterprise`（旧: bronze/silver/gold から変更）

**Supabase 管理エンティティ**: User, Address, InvitationCode, InvitationUse, Order, OrderItem, CartItem, Favorite

**Sanity 管理エンティティ**: Product（ランク別価格・ファイル含む）, Announcement

**Stripe 管理**: Customer, Subscription, Invoice（Supabase からは ID のみ保持）

### 7-2. Row Level Security（RLS）方針

RLS の詳細なポリシー定義はマイグレーションファイルで管理する。基本方針:

- 会員は自分のデータ（注文・カート・住所・お気に入り）のみ参照・更新可能
- 商品は `min_rank` と会員の `rank` を比較し、閲覧可否をデータベース層で強制する
- 運営者ロール（Clerk Organization）はすべての会員データを参照可能

> **重要**: RLSはデータベースレベルの強制であり、アプリケーションコードのバグによるデータ漏洩をゼロにする。クローズドECの「情報の秘匿」という最大要件を構造的に担保する。

---

## 7-bis. ORM・クエリビルダー方針

### 採用技術

| 用途                             | ツール                     | 理由                                  |
| -------------------------------- | -------------------------- | ------------------------------------- |
| 日常的なCRUDクエリ               | Supabase型付きクライアント | スキーマから自動生成された型でSQL不要 |
| 結合・集計など複雑なクエリ       | Drizzle ORM                | Edge Runtime対応の唯一の主要ORM       |
| スキーマ変更（マイグレーション） | Supabase CLI               | RLSポリシーも含めて管理できる         |

### Prismaを採用しない理由

PrismaはCloudflare WorkersのEdge Runtimeで動作しない。動かすには「Prisma Accelerate」という有料プロキシサービスが別途必要になり、コストと複雑さが増す。

### 型の自動生成フロー

スキーマ変更のたびに以下のコマンドで型定義を再生成し、コミットに含める：

```bash
supabase gen types typescript --local > src/types/database.types.ts
```

これにより、テーブル構造とアプリコードの型が常に同期される。

---

## 8. 認証・認可設計

### 8-1. Clerk設定

| 設定               | 値                                    |
| ------------------ | ------------------------------------- |
| 認証方式           | メールアドレス＋パスワード（MVP段階） |
| ソーシャルログイン | 無効（MVP）→ フェーズ2で検討          |
| MFA                | オプション（推奨表示）                |
| セッション有効期限 | 30日（スライディング）                |

### 8-2. 役割分担の明確化

Clerkとアプリコード・Supabaseの役割を明確に分離する：

| 機能                                         | 実装場所                | 例                                   |
| -------------------------------------------- | ----------------------- | ------------------------------------ |
| 「誰がログインしているか」の管理             | Clerk                   | ログイン・ログアウト・パスワード管理 |
| 「このユーザーは何ランクか」の保持           | Clerk（メタデータ）     | rank: "pro"                          |
| 「どのデータを見せるか」の制御               | Supabase RLS            | Pro以上のみ限定商品を返す            |
| 「月の注文上限チェック」などのビジネスルール | アプリコード + Supabase | 今月の合計金額をDBから取得して判定   |

ランク条件の変更（上限金額・対象商品の切り替えなど）はアプリコードの設定値を変えるだけで対応可能。ランク段階の追加はClerkメタデータの値とRLSポリシーの両方を更新する（エンジニア作業：数時間程度）。

### 8-3. 会員ランクの管理方法

ClerkのユーザーメタデータにランクをカスタムClaimとして付与する：

```typescript
// Clerk publicMetadata の構造
{
  "rank": "free" | "entry" | "standard" | "pro" | "enterprise",
  "invitedBy": "<user_id>",
  "invitationCode": "<code>"
}
```

`middleware.ts`（Next.js Middleware）でセッションのClaimを参照し、ページ・APIエンドポイントへのアクセスを制御する。

### 8-4. 認証フロー

```
1. 未認証アクセス
   → middleware.ts が検知 → 未認証リクエストをブロック

2. 新規登録フロー（招待コードあり）
   → /invite で招待コード検証 → 有効
   → 利用規約ページを表示（同意しないと次へ進めない）
   → 同意 → Clerk 会員登録フォームへ
   → 登録完了 → Clerk PublicMetadata に rank: "free" を付与
     （規約同意の記録はClerkのlegal_accepted_atのみで管理し、Supabase側には保持しない）
   → Supabase users テーブルにレコード挿入（Server Action）

3. ログイン済みアクセス
   → middleware.ts が Clerk JWT を検証 → 通過
   → Supabase クライアントに Clerk JWT を渡して RLS を適用
```

---

## 9. セキュリティ要件

### 9-1. クローズド環境の3層防御

| 層                     | 実装箇所                        | 内容                                                                  |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------- |
| **エッジ層（最重要）** | `middleware.ts`                 | 未認証リクエストに対してHTMLコンテンツを一切返さない。                |
| **HTTPヘッダー層**     | `next.config.ts` の `headers()` | `X-Robots-Tag: noindex, nofollow` を全レスポンスに付与。              |
| **HTML層**             | `app/layout.tsx`                | `<meta name="robots" content="noindex, nofollow">` を全ページに配置。 |

> **`robots.txt` だけでは不十分な理由**: クローラーはSNS等の外部リンクを辿ってインデックスを作成する可能性があるため、HTMLコンテンツを物理的に返さないことが必須。

### 9-2. スクレイピング対策

- **Cloudflare WAF**: IP Reputationフィルタリング・Bot管理を有効化（Pages利用時に組み込み済み。Vercel WAFより高機能）
- **Rate Limiting**: Cloudflare Workers（`middleware.ts` / Edge Runtime）で実装。会員ランク別のAPIリクエスト上限を設定。
- **異常検知**: 不自然に高速なページ遷移やAPIの連続呼び出しを検知した場合、Clerkセッションを即時無効化。

### 9-3. PCI DSS v4.0への対応

**目標準拠レベル**: SAQ A（最も軽量なセルフアセスメント）

| 要件                                   | 実装                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| カード情報を自社サーバーに通過させない | Stripe Checkout（外部リダイレクト型）を使用                      |
| Req 6.4.3 スクリプト管理               | Stripeスクリプト以外の外部スクリプトを決済関連ページに設置しない |
| Req 11.6.1 改ざん検知                  | Cloudflare PagesのデプロイハッシュとSRI属性による整合性管理      |

### 9-4. ログ保存体制（フェーズ3で実装）

- Cloudflare Logpush → 外部ストレージ（R2またはS3）へ転送
- 保存期間：90日以上（法的要件に基づき決定）
- アクセスログ・エラーログ・Workersログを分離管理

---

## 10. 決済設計

### 10-1. 決済フローの概要

注文内容によって2つのフローに自動分岐する。詳細は `docs/order-flow.md` を参照。

| フロー              | 条件                    | 決済方法                      | 運営者の決済作業   |
| ------------------- | ----------------------- | ----------------------------- | ------------------ |
| **Checkout フロー** | 全商品が固定価格        | Stripe Checkout（即時・自動） | ゼロ               |
| **Invoice フロー**  | 要相談商品を1つでも含む | Stripe Invoice（手動発行）    | Invoice を毎回作成 |

### 10-2. Checkout フロー

```
1. 会員がカートを確定 → 「注文する」ボタンをクリック
2. システムが月次仕入れ上限チェック（全額）
3. Server Action が Stripe Checkout Session を作成
4. 注文を "pending_payment" ステータスで記録
5. 会員を Stripe のホスト型決済ページへリダイレクト
6. 決済完了 → Stripe が checkout.session.completed Webhook を送信
7. Webhook ハンドラが注文ステータスを "paid" に更新・完了メール送信
```

### 10-3. Invoice フロー

```
1. 会員がカートを確定 → 「注文する」ボタンをクリック
2. システムが月次仕入れ上限チェック（固定価格分のみ）
3. 注文を "confirming" ステータスで記録・運営者に通知
4. （要相談商品があれば）運営者が仕入れ先と価格交渉
5. 運営者が管理画面で請求金額を入力
6. システムが月次仕入れ上限チェック（全額）
7. 運営者が Stripe Invoice を発行・会員にメール送信
8. 会員が Invoice を支払い → invoice.paid Webhook → "paid" に更新
```

### 10-4. MVP段階の決済手段

| 決済手段                             | 対応状況                             |
| ------------------------------------ | ------------------------------------ |
| クレジットカード（VISA/MC/JCB/AMEX） | MVP対応                              |
| Apple Pay / Google Pay               | MVP対応（Stripe Checkoutが自動対応） |
| コンビニ払い                         | フェーズ2以降                        |
| BNPL（Paidy等）                      | フェーズ4以降                        |

### 10-5. Webhook検証（必須）

```typescript
// app/api/stripe/webhook/route.ts
const event = stripe.webhooks.constructEvent(
  body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET // 署名検証を必ず行う
);

// 処理するイベント
// checkout.session.completed → Checkout フローの決済完了
// invoice.paid              → Invoice フローの決済完了
```

---

## 11. CMS設計

### 11-1. Sanityスキーマ構成

```
Sanity Content Lake
  ├─ product（商品）
  │   ├─ name: string
  │   ├─ slug: slug
  │   ├─ description: portableText
  │   ├─ images: image[]
  │   ├─ minRank: string（free | entry | standard | pro | enterprise）
  │   └─ category: reference → category
  │
  ├─ category（カテゴリ）
  │
  └─ announcement（会員向けお知らせ）
      ├─ title: string
      ├─ body: portableText
      ├─ publishedAt: datetime
      └─ targetRanks: string[]（対象ランク）
```

### 11-2. Sanityデータセット

| 環境            | データセット            |
| --------------- | ----------------------- |
| dev（ローカル） | `staging`（stg と共用） |
| stg             | `staging`               |
| prod            | `production`            |

> **注意**: Sanityのデータセットはプロジェクト内で管理するため、Supabaseのように別プロジェクトにする必要はない。無料プランはデータセット2つまでのため `staging`（dev/stg 共用）と `production` の2つで運用する。ローカルで作成・編集したコンテンツは stg にも即反映される点に注意。

### 11-3. コンテンツ更新権限

- 運営担当者はSanity Studioから商品情報・お知らせをノーコードで更新可能
- Sanity Studioはエンジニアが `sanity deploy` コマンドでホスティングし、専用URLで提供
- 商品画像はSanity CDN（Cloudflare）から配信

### 11-4. スプレッドシートからの商品一括インポート

**結論: 可能。以下の2方式を用途に応じて選択する。**

#### 方式A: 手動実行スクリプト（初期データ移行・大量登録向け）

運営担当者がGoogleスプレッドシートに商品情報を記入し、エンジニアがスクリプトを実行してSanityへ一括インポートする。

**スプレッドシートのテンプレート仕様（列構成）**:

| 列名               | 型                                 | 必須 | 例                            |
| ------------------ | ---------------------------------- | ---- | ----------------------------- |
| `name`             | text                               | ✅   | プレミアムTシャツ             |
| `slug`             | text                               | ✅   | premium-tshirt（URL用の英字） |
| `price`            | number                             | ✅   | 15000                         |
| `sku`              | text                               | ✅   | SKU-001                       |
| `min_rank`         | free/entry/standard/pro/enterprise | ✅   | free                          |
| `category`         | text                               | ✅   | tops                          |
| `description`      | text                               | —    | 長文テキスト                  |
| `initial_quantity` | number                             | ✅   | 50                            |

**インポートフロー**:

```
1. 運営担当者がテンプレートシートに商品情報を記入
2. エンジニアが import スクリプトを実行
   npx tsx scripts/import-products.ts --sheet=<SheetID> --dataset=production
3. スクリプトが Google Sheets API でシートを読み取り
4. バリデーション（必須列・型チェック）を実行
5. @sanity/client の batch mutations でSanityへ一括登録
6. Supabase の inventory テーブルにも在庫データを同期
```

#### 方式B: 定期自動同期（継続的な在庫・価格更新向け）

Cloudflare Workersの`Cron Trigger`機能を使い、スプレッドシートの変更を定期的に検知してSanityと在庫DBを自動更新する。

```
[Cloudflare Workers Cron] ──毎時実行──▶ Google Sheets API で差分検出
                                              ↓ 変更あり
                                        Sanity + Supabase を更新
```

> **MVP段階では方式Aのみ実装する。**方式Bはシート管理ルールが固まった後（フェーズ3以降）に追加する。

#### 技術的な注意点

- Google Sheets APIの認証にはサービスアカウントを使用する（OAuth不要で自動化に適している）
- インポートスクリプトは `scripts/` ディレクトリに配置し、本番データへの誤実行を防ぐため `--dataset` フラグを必須とする
- Sanityの画像はスプレッドシートには含められないため、テキスト情報をインポート後にSanity Studioで画像を追加する運用とする

---

## 11-bis. データ分析方針

### 保存されるデータの場所

| データ種別           | 保存先     | 内容                                         |
| -------------------- | ---------- | -------------------------------------------- |
| 認証情報             | Clerk      | メールアドレス、パスワード（暗号化）、ランク |
| 会員プロフィール     | Supabase   | 氏名、住所、誕生日、招待元など               |
| 注文・購買履歴       | Supabase   | 誰が・何を・いつ・いくらで購入したか         |
| 在庫データ           | Supabase   | 商品別の在庫数・予約数                       |
| 商品情報・コンテンツ | Sanity CMS | 商品名・説明・画像                           |

### 売れ筋分析の実装方針（段階的に導入）

| フェーズ                | 方法                                     | 使う人                       |
| ----------------------- | ---------------------------------------- | ---------------------------- |
| **MVP（フェーズ1〜3）** | Supabase内蔵のSQL実行画面                | エンジニアが都度集計         |
| **フェーズ2**           | Metabase（無料BIツール）をSupabaseに接続 | 運営担当者がグラフで確認可能 |
| **フェーズ3以降**       | 管理画面に売上ダッシュボードを実装       | 誰でも確認可能               |

Metabaseの導入はSupabaseへの接続設定のみで完了し、開発工数はほぼかからない。運営担当者がSQLを書かずに「先月の売上TOP商品」「ランク別の購入単価」などをグラフで確認できるようになるため、フェーズ2での導入を推奨する。

---

## 11-ter. CLIツール一覧

**方針：全ての操作をCLI経由で行い、GUIダッシュボードへの依存を避ける。**GUIは手順の再現性がなく、チーム共有・自動化ができないため。

| ツール           | コマンド   | 主な用途                                                         |
| ---------------- | ---------- | ---------------------------------------------------------------- |
| **Supabase CLI** | `supabase` | マイグレーション管理、型生成、ローカル開発環境起動               |
| **Wrangler CLI** | `wrangler` | Cloudflare Pages/Workersへのデプロイ、シークレット管理、ログ確認 |
| **Sanity CLI**   | `sanity`   | Sanity Studioのデプロイ、スキーマ検証                            |
| **GitHub CLI**   | `gh`       | PR作成・マージ、Issue管理                                        |
| **pnpm**         | `pnpm`     | パッケージ管理（npmより高速・省ディスク）                        |

### Supabase CLIの主要コマンド

```bash
# ローカル開発環境の起動（DB含む）
supabase start

# マイグレーションファイルの新規作成
supabase migration new add_birthday_to_users

# マイグレーションをローカルDBに適用
supabase db reset

# マイグレーションを本番DBに適用
supabase db push --db-url $SUPABASE_PROD_URL

# TypeScript型定義の再生成
supabase gen types typescript --local > src/types/database.types.ts
```

### Wrangler CLIの主要コマンド

```bash
# シークレット（環境変数）の設定
wrangler pages secret put CLERK_SECRET_KEY

# デプロイ（通常はGitHub連携で自動。手動実行が必要な場合）
wrangler pages deploy ./.next

# リアルタイムログの確認
wrangler pages deployment tail
```

---

## 12. テスト戦略

### 12-1. テスト種別と範囲

| 種別           | ツール             | 対象                               | CIトリガー |
| -------------- | ------------------ | ---------------------------------- | ---------- |
| 型チェック     | TypeScript (`tsc`) | 全ソースコード                     | 全PR       |
| Lintチェック   | ESLint + Prettier  | 全ソースコード                     | 全PR       |
| ユニットテスト | Vitest             | 純粋な関数・バリデーションロジック | 全PR       |
| 統合テスト     | Vitest + 実DB      | RLSポリシー・APIルート・Webhook    | 全PR       |
| E2Eテスト      | Playwright         | クリティカルパス                   | 全PR       |

### 12-1-1. テスト種別の選択基準

機能を実装する際は、以下の基準で必要なテスト種別を判断する。

| 実装内容                                     | 書くべきテスト種別 | 理由                                       |
| -------------------------------------------- | ------------------ | ------------------------------------------ |
| 純粋な計算・バリデーション関数（副作用なし） | ユニットテスト     | 速い・安い・パターン網羅しやすい           |
| RLSポリシーを含むスキーマ変更                | 統合テスト（実DB） | UIを経由しないSQLアクセスをE2Eでは検証不可 |
| APIルート（DB読み書きあり）                  | 統合テスト（実DB） | DBとの連携バグはE2Eでは発見が遅い          |
| Stripe Webhookハンドラー                     | 統合テスト         | ブラウザ操作で再現不可                     |
| クリティカルな業務フロー全体                 | E2Eテスト          | 複数システムをまたぐ結合を確認             |
| UIコンポーネントの見た目・レイアウト         | 不要               | E2Eまたは目視で十分                        |

### 12-2. E2Eテストのクリティカルパス

| テストケース           | 確認内容                                              |
| ---------------------- | ----------------------------------------------------- |
| `auth/invitation`      | 招待コード入力 → 会員登録 → ログイン完了              |
| `auth/login`           | メールアドレス・パスワードでのログイン                |
| `auth/unauthenticated` | 未認証アクセスが 404 を返すこと（HTMLを返さないこと） |
| `product/list`         | 商品一覧が表示されること                              |
| `product/rank-filter`  | ランク外の商品が表示されないこと                      |
| `cart/checkout`        | カート追加 → Stripe Checkout へのリダイレクト         |
| `order/complete`       | 購入完了後に注文履歴に反映されること                  |

### 12-3. テスト実行環境

- E2EテストはCIから **stg環境** に対して実行する
- stg用のClerkテストアカウント・Stripe テストカードを使用
- テストデータはテスト前後でクリーンアップするfixtures/teardownを実装

---

## 13. 環境変数管理

### 13-1. 命名規則

```
NEXT_PUBLIC_*   クライアントサイドで参照可能（公開情報のみ設定すること）
*               サーバーサイドのみ（シークレット。クライアントに露出厳禁）
```

### 13-2. 主要な環境変数一覧

| 変数名                               | dev                              | stg                      | prod                     |
| ------------------------------------ | -------------------------------- | ------------------------ | ------------------------ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | dev キー                         | stg キー                 | prod キー                |
| `CLERK_SECRET_KEY`                   | dev シークレット                 | stg シークレット         | prod シークレット        |
| `NEXT_PUBLIC_SUPABASE_URL`           | devプロジェクトURL               | stgプロジェクトURL       | prodプロジェクトURL      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | dev anonキー                     | stg anonキー             | prod anonキー            |
| `SUPABASE_SERVICE_ROLE_KEY`          | dev service roleキー             | stg service roleキー     | prod service roleキー    |
| `STRIPE_SECRET_KEY`                  | `sk_test_...`                    | `sk_test_...`            | `sk_live_...`            |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...`                    | `pk_test_...`            | `pk_live_...`            |
| `STRIPE_WEBHOOK_SECRET`              | dev webhookシークレット          | stg webhookシークレット  | prod webhookシークレット |
| `NEXT_PUBLIC_SANITY_PROJECT_ID`      | 共通                             | 共通                     | 共通                     |
| `NEXT_PUBLIC_SANITY_DATASET`         | `staging`（stg と共用）          | `staging`                | `production`             |
| `SANITY_API_TOKEN`                   | read/write トークン              | read/write トークン      | read only トークン       |
| `NEXT_PUBLIC_SENTRY_DSN`             | 共通（同一プロジェクト）         | 共通（同一プロジェクト） | 共通（同一プロジェクト） |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT`     | `dev`                            | `stg`                    | `prod`                   |
| `SENTRY_AUTH_TOKEN`                  | ビルド時のみ（ソースマップ送信） | ビルド時のみ             | ビルド時のみ             |

### 13-3. 管理方法

#### ローカル開発（Doppler経由、`.env.local`等は使わない）

シークレットは`.env.local`/`.env.stg`/`.env.prod`のようなローカル参照ファイルには置かず、Dopplerで一元管理する（`dev`/`stg`/`prod`の3つのDoppler Config）。ローカルでシークレットが必要なコマンドはすべて`doppler run --`でラップして実行する（`Taskfile.yml`の各タスク、または`doppler run -- <command>`を直接実行）。

Doppler Config切り替え例: `doppler run --config stg -- <command>`

#### `NEXT_PUBLIC_*` 変数（ビルド時に JS バンドルへ埋め込まれる）

GitHub Secrets に登録し、`deploy.yml` の各ビルドステップで `env:` として渡す。stg と prod で別シークレット名を使う：

| GitHub Secret 名                                             | stg           | prod          |
| ------------------------------------------------------------ | ------------- | ------------- |
| `CLERK_PUBLISHABLE_KEY_STG` / `CLERK_PUBLISHABLE_KEY_PROD`   | `pk_test_...` | `pk_live_...` |
| `SUPABASE_URL_STG` / `SUPABASE_URL_PROD`                     | stg URL       | prod URL      |
| `SUPABASE_ANON_KEY_STG` / `SUPABASE_ANON_KEY_PROD`           | stg anon key  | prod anon key |
| `STRIPE_PUBLISHABLE_KEY_STG` / `STRIPE_PUBLISHABLE_KEY_PROD` | `pk_test_...` | `pk_live_...` |
| `SANITY_PROJECT_ID`                                          | 共通          | 共通          |
| `SENTRY_DSN`                                                 | 共通          | 共通          |

#### ランタイム変数（サーバー・エッジで参照、Cloudflare Pages に設定）

stg（`brand-closed-ec-stg`）と prod（`brand-closed-ec-prod`）は別プロジェクトのため、それぞれのダッシュボードで個別設定可能：

`CLERK_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `SANITY_API_TOKEN`

- **`NEXT_PUBLIC_*` 以外をクライアントコンポーネントで参照しない**ことをESLintルールで強制する

---

## 14. MVPスコープ（フェーズ定義）

### フェーズ1：セキュリティ基盤（第1〜4週）

| タスク                                               | 担当         | 備考                                                                  |
| ---------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| GitHubリポジトリ作成・ブランチ保護ルール設定         | インフラ     | main/developブランチの保護を最初に設定                                |
| Cloudflare Pagesプロジェクト作成（prod/stg）         | インフラ     | GitHub連携・カスタムドメイン設定・`@cloudflare/next-on-pages`設定含む |
| Linear プロジェクト・GitHub連携設定                  | PM           | Conventional Commitsのルール周知                                      |
| GitHub Actions CI設定（型チェック・Lint）            | インフラ     | e2e.ymlはフェーズ2末に追加                                            |
| Next.js 16 + TypeScript プロジェクト初期化           | フロント     | strictモード、ESLint、Prettier設定                                    |
| Clerk統合・`middleware.ts`による未認証シャットアウト | フロント     | 最優先。これがなければクローズドが成立しない                          |
| Supabaseセットアップ（3環境分）                      | バックエンド | RLS有効化、基本スキーマ定義                                           |
| 招待コード発行・検証APIの実装                        | バックエンド | invitations テーブル＋API Route                                       |
| 招待コード入力ページ（唯一の公開ページ）実装         | フロント     | —                                                                     |
| Sentry統合（全環境）                                 | インフラ     | エラー監視を初期から有効化                                            |
| `X-Robots-Tag` / `noindex` の設定                    | フロント     | —                                                                     |

### フェーズ2：コアEC機能（第5〜10週）

| タスク                                               | 担当                  | 備考                                                                        |
| ---------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- |
| Sanity CMSセットアップ・商品スキーマ定義             | フロント/バックエンド | Sanity Studioの運営者向けデプロイ含む                                       |
| 商品カタログページ（ランク別表示切替）               | フロント              | RLSで担保されているが表示でも制御                                           |
| 在庫管理APIの実装                                    | バックエンド          | ソフト予約ロジック含む                                                      |
| カート機能（セッション/DB）                          | フロント/バックエンド | —                                                                           |
| Stripe Checkout / Invoice 決済フロー実装             | バックエンド          | Webhookハンドラ・署名検証必須。固定価格は Checkout、要相談は Invoice フロー |
| 注文履歴・マイページ                                 | フロント              | —                                                                           |
| 会員ランク（Free/Entry/Standard/Pro/Enterprise）管理 | バックエンド          | Clerk Metadata連携                                                          |
| Playwright E2Eテスト実装・CI組み込み                 | テスト                | クリティカルパス全件                                                        |

### フェーズ3：運用・コンプライアンス（第11〜14週）

| タスク                               | 担当                  | 備考                                           |
| ------------------------------------ | --------------------- | ---------------------------------------------- |
| 管理画面（会員・注文・在庫CRUD）     | フロント/バックエンド | Supabase Studioで代替できる部分はMVP外でもよい |
| ブランチ保護・CIの最終調整           | インフラ              | 全ステータスチェックを必須化                   |
| PCI DSS v4.0チェックリスト対応       | セキュリティ          | ドキュメント作成含む                           |
| Cloudflare Logpush設定・ログ保存体制 | インフラ              | R2またはS3への転送設定                         |
| stg環境での負荷テスト                | インフラ              | 想定同時接続数に対するレスポンス検証           |
| SEO拒否設定の最終確認                | フロント              | 全ページでnoindexが適用されていること          |

### フェーズ4以降（MVP外）

- LINEミニアプリ対応（ヘッドレス構成のため追加可能）
- Algolia全文検索・OpenAI APIレコメンデーション
- BNPL（Paidy等）統合
- セッションリプレイ（LogRocket）
- 多言語対応（海外会員向け）
- ネイティブアプリ（iOS/Android）

---

## 15. 運用コスト見積もり

### 15-1. MAU別月額コスト比較

| 規模                | Cloudflare + Supabase（採用構成） | Vercel + Supabase | 備考                                 |
| ------------------- | --------------------------------- | ----------------- | ------------------------------------ |
| Startup（〜1万MAU） | 〜$5/月                           | 〜$30/月          | CF Workers Paid $5 + Supabase Free枠 |
| Growth（〜10万MAU） | 〜$30/月                          | 〜$630/月         | CF Workers + Supabase Pro $25        |
| Scale（〜100万MAU） | 〜$200/月                         | 〜$19,000/月      | CFは帯域幅が無料のため差が拡大       |

> **Cloudflareがコスト優位な理由**: Cloudflare Pages・Workersは**帯域幅が完全無料**（Vercelは使用量課金）。Workers Paidは月$5固定＋1,000万リクエスト超過分のみ従量課金（$0.50/100万req）。

### 15-2. 主要SaaSの月額費用（Growth期想定）

| サービス                       | プラン       | 月額                           | 備考                         |
| ------------------------------ | ------------ | ------------------------------ | ---------------------------- |
| **Cloudflare Pages + Workers** | Workers Paid | $5/月                          | 帯域幅無制限。WAF・CDN込み。 |
| **Supabase**                   | Pro          | $25/プロジェクト（3環境で$75） | —                            |
| **Clerk**                      | Pro          | $25/月〜                       | MAU課金                      |
| **Sanity**                     | Growth       | $15/月〜                       | —                            |
| **Stripe**                     | —            | 決済手数料 3.6%                | 国内カード                   |
| **Algolia**                    | Build        | 無料〜$1,000/月                | 検索数次第                   |
| **Sentry**                     | Team         | $26/月〜                       | —                            |
| **Linear**                     | Business     | $8/シート/月                   | —                            |

### 15-3. Vercelとの比較

Cloudflare Pages + Workers を採用することで、Vercel Pro構成と比較して**ホスティングコストを約85〜99%削減**できる。コスト差の主因はVercelの帯域幅課金（$0.40/GB）に対してCloudflareが帯域幅無料であること。クローズドECは会員数が絞られているためトラフィックは限定的だが、商品画像等の静的ファイル配信でもコスト差が出る。

---

_本ドキュメントはhearing.md / strategy.md に基づいて作成。ヒアリング回答が確定次第、各要件の詳細を更新する。_
