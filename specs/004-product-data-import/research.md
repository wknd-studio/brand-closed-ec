# Phase 0 Research: 業者商品データの統一インポート基盤

spec.mdのAssumptionsで「技術選定に関する事項は本仕様の対象外とし、後続の実装計画で決定する」とされていた論点を、ここで決定する。

## 1. CSVパース・変換ロジックの実行場所

**Decision**: CSVの読み込み・列マッピング・検証・重複判定・Sanityへの書き込みは、すべて`src/lib/product-import/`の共有関数として実装し、Sanity Studioのカスタムツール（ブラウザ内）から、Studioが既に保持している認証済み`@sanity/client`インスタンス（`useClient`フック）を使って直接呼び出す。

**Rationale**: Sanity Studioのカスタムツールは、Sanity自身の権限モデル（プロジェクトメンバーのデータセット書き込み権限）で既に保護されたReactアプリである。CSVアップロード→検証→書き込みという操作は、担当者本人のセッションでSanityへ直接書き込む形にすれば、Next.jsアプリ側に別の管理画面や認証連携を新設する必要がない（FR-016）。既存の`scripts/seed-products.ts`と同じ`@sanity/client`の使い方を、実行環境（ブラウザ／Node）に依存しない共有ロジックとして切り出すことで、スクレイピング側（Node実行）とも処理を共通化できる。

**Alternatives considered**:

- 専用のNext.js APIルートを新設し、そこでCSVを処理してSanityへ書き込む: Studio利用者（Sanity側の認証）とNext.jsアプリ側の認証（Clerk）が別システムであるため、二重の認証連携が必要になり複雑化する。CSVアップロードのような対話的操作にサーバーを一つ挟む必然性もない。不採用。

## 2. CSVパースライブラリ

**Decision**: `papaparse`を採用する。

**Rationale**: ブラウザ・Node.jsの両方で動作し、文字コード（BOM付きUTF-8等）や区切り文字の揺れに対して寛容な設定オプションを持つ。Sanity Studioツール（ブラウザ実行）と将来的なCLIでの検証用途（Node実行）の両方から同じパース処理を再利用できる。

**Alternatives considered**:

- `csv-parse`: Node.jsのストリームAPICentricで、ブラウザバンドルには不向き。Studioツール側で別ライブラリが必要になり、パースロジックの二重管理になるため不採用。

## 3. スクレイピングの実行基盤（定期実行・オンデマンド実行の受け口）

**Decision**: GitHub Actionsの新規workflow（`.github/workflows/product-data-sync.yml`）を作成し、`schedule`（日次cron）と`workflow_dispatch`（手動トリガー、業者IDをinputとして受け取る）の両方をトリガーとして登録する。実行内容はNode CLIスクリプト（`scripts/product-import/run-scheduled-sync.ts` / `run-on-demand.ts`）で、既存の`scripts/seed-products.ts`等と同じくCIのUbuntu runner上でtsx経由で実行する。

**Rationale**: 既存のNode製スクリプト資産（`@sanity/client`利用）との親和性が最も高い。GitHub Actionsの`workflow_dispatch`はAPI経由でinput付きトリガーが可能なため、オンデマンド実行（業者単位の即時実行、FR-021）ともそのまま接続できる。

**Alternatives considered**:

- Cloudflare Cron Triggers: 本プロジェクトのCloudflare Workersランタイムは`@cloudflare/next-on-pages`上で動くアプリケーション本体用であり、`cheerio`等のNode依存のスクレイピングライブラリを問題なく動かせる保証がない。また既存のスクリプト資産（`scripts/`配下）との統一感も失われるため不採用。

## 4. スクレイピングのHTML取得・パース方法

**Decision**: 既定は`fetch` + `cheerio`（静的HTMLの軽量パース）とする。業者サイトがJavaScriptによる動的レンダリングに依存しており`cheerio`では商品情報を取得できないことが判明した場合に限り、その業者のアダプター（`scripts/product-import/vendors/<vendor-id>/scraper.ts`）でのみ、既存devDependencyの`@playwright/test`が提供する`playwright`ランタイムを使う。

**Rationale**: 業者サイトの実装は個社ごとに異なり、全業者に対して一律で重いヘッドレスブラウザ（Playwright）を使う必要はない。`cheerio`はCI実行時間・リソース消費の観点で軽量であり、大半の静的な商品一覧・注文ページはこれで十分対応できる。個別に必要な場合のみ選択的にPlaywrightを使う設計にすることで、CI全体の実行時間増加を抑える。

**Alternatives considered**:

- 全業者共通でPlaywrightを使う: 実装の一貫性は上がるが、CI実行時間・リソース消費が不必要に増える業者が大半になると想定されるため不採用。

## 5. オンデマンド実行トリガーの認証方式

**Decision**: Sanity StudioのカスタムツールからNext.jsアプリの新規エンドポイント（`src/app/api/admin/product-import/trigger/route.ts`）を呼び出し、そのエンドポイントがサーバーサイドで保持するGitHub PAT（`wrangler pages secret put`で設定）を使い、GitHub Actionsの`workflow_dispatch` REST APIを呼ぶ。Studio側からこのエンドポイントを呼ぶ際の認証は、Clerkによる会員認証ではなく、Studio用に発行するスコープ限定の共有シークレット（このエンドポイントを呼ぶことだけに使える、GitHubへの直接アクセス権は持たない値）をStudio設定に埋め込み、リクエストヘッダーで送る方式とする。

**Rationale**: Sanity Studioの利用者（商品管理担当者）はSanity独自の認証で既に権限管理されており、Next.jsアプリ側のClerkセッションを持っているとは限らない。GitHub PATのようなスコープの広いシークレットをブラウザ（Studioツール）に直接埋め込むことは避けるべきだが、「特定の1エンドポイントを叩けるだけ」の共有シークレットであれば、Studio利用者が既に信頼された内部担当者であることを踏まえると許容範囲のリスクである。GitHub PAT自体はサーバーサイド（Next.jsのAPIルート）にのみ保持し、ブラウザに渡らないようにする。

**Alternatives considered**:

- Sanity上に「実行リクエスト」ドキュメントを作成し、GitHub Actions側が定期的にポーリングして拾う方式: GitHubトークンをどこにも埋め込まずに済む点は安全だが、ポーリング間隔ぶんの遅延が発生し「今すぐ実行したい」というUser Story 2の意図に反する。また定期実行用のworkflowとポーリング用のworkflowの二重管理になり複雑さが増すため不採用。
- Clerkセッションでの認証: Studio利用者がNext.jsアプリのClerkアカウントも持っている前提が必要になり、Sanity Studioの権限管理とNext.jsアプリの会員権限管理という別々の認可システムを混在させることになるため不採用。

## 6. 「業者」を表すデータモデルの要否

**Decision**: 既存の`brand`（ブランド）とは別に、新規Sanityドキュメントタイプ`vendor`（仕入れ業者）を追加する。1業者が複数ブランドの商品を卸す可能性、および同一ブランドの商品を複数の業者から仕入れる可能性の両方があり得るため、`brand`と`vendor`は独立した多対多の関係として扱う。

**Rationale**: spec.mdのKey Entity「商品データソース（業者）」は、CSV提供業者かスクレイピング対象業者かの区分・取引契約の有無・（スクレイピングの場合は）対象サイトの情報を持つ必要があり、既存の`brand`ドキュメント（ブランドそのものの表示用属性）とは責務が異なる。

**Alternatives considered**: `brand`ドキュメントに業者情報を直接追加する: ブランドと仕入れ業者が1:1でない実態（複数業者から同じブランド品を仕入れる、1業者が複数ブランドを扱う）を表現できず、将来的な業者追加のたびに`brand`スキーマが肥大化するため不採用。
