# Research: デザインシステム基盤の導入

## 1. デザイントークンの置き場所

**Decision**: 新規ファイルを作らず、既存の `src/app/globals.css` の `@theme inline` ブロックを拡張する。追加する主なトークンは、現状不足している「セマンティックカラーパレット」（neutral階調、primary/secondary/success/warning/danger等）。

**Rationale**: `globals.css` には既に `--color-brand-primary` 等、ブランドごとのテーマ上書き機構が実装済み（`brand-theme-wrapper.tsx`が`--brand-*`をラッパー要素で上書きする設計、`brand-theme-style.test.ts`で検証済み）。Constitution原則V「事実の単一情報源化」に従い、トークン定義を分散させず既存の仕組みに合流させる。スペーシング・タイポグラフィのスケール（`text-sm`/`p-4`等）はTailwind v4が標準で提供する値をそのままトークンとして採用し、独自の再定義は行わない（過剰な抽象化を避ける）。

**Alternatives considered**:
- 独立した `tokens.css` や `theme.ts` を新設 → 定義箇所が2箇所になり原則Vに反するため却下
- スペーシング/タイポグラフィも独自トークンとして再定義 → Tailwindの標準スケールと二重管理になり保守コストが増すため却下

## 2. プリミティブコンポーネントのバリアント管理

**Decision**: `class-variance-authority`（cva）と `clsx` を新規依存として追加する。

**Rationale**: 現状`clsx`/`cva`は未導入。ボタンのvariant（primary/secondary/danger等）×state（disabled等）の組み合わせをTailwindクラスの文字列結合で素朴に書くと可読性・型安全性が落ちる。cvaはVariantの型をTypeScriptで検査でき、Tailwind前提のReactコンポーネントライブラリで広く使われる標準的な組み合わせ。

**Alternatives considered**:
- 素のTailwindクラス文字列結合のみ → コンポーネント数が増えると保守困難になるため却下
- shadcn/ui一式を導入 → 生成されるコンポーネント数が今回のスコープ（5種類）に対して過剰で、依存関係も増えるため今回は見送り。将来的にプリミティブが増えた段階で再検討可能

## 3. Storybookのセットアップ方式

**Decision**: Storybookの公式Next.js frameworkプリセット（React 19 / Next.js 16対応版）を `.storybook/` 配下に導入する。story ファイルはコンポーネントに併置（`src/components/ui/button.tsx` の隣に `button.stories.tsx`）。

**Rationale**: FR-005「業務フローを経由せず単体確認」を満たすにはNext.js frameworkプリセットが必要（App Router固有の機能を使わないプリミティブコンポーネントのみが対象のため、実際には最小構成でも動作する）。story併置はコンポーネント追加時にstoryの追加漏れを防ぎやすい。

**Alternatives considered**:
- 独立した `stories/` ディレクトリに集約 → コンポーネント本体との対応が追いにくくなるため却下

## 4. 既存ビルド・テストへの影響分離（FR-006, US3のシステム保証）

**Decision**: Storybook関連の依存（`@storybook/*`）・設定（`.storybook/`）・story ファイル（`*.stories.tsx`）は、Next.jsアプリ本体のビルド（`next build` / `@cloudflare/next-on-pages`）およびVitest/Playwrightの実行対象から除外する。`vitest.config.ts`のexclude、`tsconfig.json`のNext.jsビルド対象、Playwrightの`testDir`設定を確認し、必要に応じて除外パターンを追加する。

**Rationale**: spec.mdのUser Story 3が明示的に要求する「Storybook導入がアプリ本体のビルド・E2Eテスト実行に影響を与えない」を満たすための実装方針。既存のE2Eテストが`getByRole`/`name`属性ベースであることは確認済み（`checkout.spec.ts`等）なので、プリミティブコンポーネントの内部実装を変えてもrole/name/name属性が保たれる限り既存テストへの影響はない。

**Alternatives considered**: なし（spec.mdの明示的要件のため代替案の検討は不要）

## 5. Storybookの配置・公開範囲

**Decision**: ローカル開発環境限定。CI・stg・prodへのStorybookデプロイは行わない（spec.mdのAssumptionsに準拠）。

**Rationale**: spec.mdで明示的にスコープ外と定義済み。将来的に必要になれば別フィーチャーとして追加する。
