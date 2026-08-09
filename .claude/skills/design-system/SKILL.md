---
name: "design-system"
description: "このプロジェクトで画面UI・コンポーネントを新規作成/変更する際に必ず使う。EQ×Martブランド（白×ゴールド、明朝見出し）のデザイントークン(src/app/globals.css)とプリミティブ(src/components/ui/)を先に確認し、既存の資産を再利用する。新しいUIパターンが実際に繰り返し必要になった場合のみ新規プリミティブを追加する。"
argument-hint: "作業対象の画面名、または参考デザイン（画像パス/URL/説明）"
compatibility: "Next.js App Router + Tailwind CSS v4 + Storybook構成のこのリポジトリ専用"
user-invocable: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **着手前に必ず読む**
   - `src/app/globals.css` の `@theme inline` ブロック（カラー・フォント・角丸トークン）
   - `src/components/ui/` 配下の既存プリミティブ一覧（下記カタログ参照。ファイルが増えている場合は `ls src/components/ui/*.tsx` で最新化する）
   - 既存Storybook story（`pnpm storybook` で `http://localhost:6006` を開くか、`*.stories.tsx` を読む）

2. **既存資産の再利用を優先する**。新しい画面・セクションは、原則としてプリミティブの組み合わせだけで組み立てる。色・角丸・フォントは下記トークンのユーティリティクラス経由で参照し、`#a9791d` のような16進カラーやピクセル値を新しいページコンポーネントに直接書かない（プリミティブ内部で必要な場合を除く）。

3. **参考デザイン（画像・Figma・既存サイト等）がある場合の進め方**（今回のHome画面刷新で実際に踏んだ手順）:
   1. 参考のトンマナ（配色・タイポグラフィ・余白）を抽出し、ユーザーとすり合わせる
   2. Artifactツールでビジュアルモックアップを作り、ユーザーの承認を得る（`artifact-design` skillを使う）
   3. 承認されたモックアップを、まずはページコンポーネント内で**忠実に**実装する（この段階ではプリミティブ化を急がず、必要なら生の値をそのまま使ってよい）
   4. Playwrightでdevサーバーのスクリーンショットを撮り、モックアップと目視比較して仕上げる（lint/typecheckのパスだけでは見た目のバグは検知できないため必須）
   5. 実装が確定してから、実際に使われた値・繰り返しパターンをトークン/プリミティブとして抽出する（このSKILL.mdのカタログも更新する）

4. **新規プリミティブを追加する基準**: 同じ見た目パターンが2箇所以上で必要になった時点で追加する。1箇所でしか使わない装飾は抽象化しない（YAGNI）。追加したら必ずStorybookの`*.stories.tsx`も作成する（storyがないコンポーネントはStorybook上で見つけられない）。

5. **見た目を変更したら必ずスクリーンショットで確認する**。`pnpm dev`でサーバーを起動し、Playwright（`@playwright/test`が既にインストール済み）でページを開いてスクリーンショットを撮る。デスクトップ幅とモバイル幅（例: 390x844）の両方を確認する。

## デザイントークン・カタログ（`src/app/globals.css`）

- `--color-primary` / `--color-primary-foreground` / `--color-primary-light`: ブランドのゴールド。`bg-primary` `text-primary` `border-primary` `from-primary-light` 等で使う
- `--color-secondary`: 補助テキスト色
- `--color-neutral-50〜900`: 暖色寄りのウォームグレー。ボーダー・非活性テキスト・背景に使う（純グレーではない点に注意）
- `--font-sans`: 本文用（日本語フォールバック込み）
- `--font-display`: 見出し用の明朝体。`font-display`クラスで使う（本文には使わない）
- `--radius-2xl` (14px) / `--radius-3xl` (18px): カード・パネルの角丸。`rounded-2xl` `rounded-3xl` で使う

## プリミティブ・カタログ（`src/components/ui/`）

- `Button`: `variant`(primary/secondary/danger) × `size`(md/sm)。primaryはピル型ゴールドグラデーション
- `Card`: `featured`バリアント付きの汎用カード
- `Heading`: `level`(display/section/compact)。明朝フォント。`display`は手動`<br/>`前提でtext-wrap:balanceを付けない
- `Eyebrow`: セクション見出し上のラベル。`withLine`で先頭に短い罫線を付けられる
- `Container`: 中央寄せ+レスポンシブpadding（max-w-[1080px]）
- `Section`: `Container`を内包した縦方向リズム付きセクションラッパー
- `SectionHeader`: Eyebrow+Heading+説明文のセット
- `FeatureGrid`: 罫線区切りのカードグリッド（`columns`/`dense`で調整）
- `Input` / `Select` / `Checkbox` / `Radio`: フォーム部品。すでにトークン参照で書かれているため追加対応不要

## 注意事項

- 新規プリミティブ・トークンを追加した場合は、このSKILL.mdのカタログを更新すること（陳腐化を防ぐため）
- ブランドの世界観（白ベース+ゴールドアクセント、OSのダークモード設定に関わらず常時ライト表示）はHOME画面刷新時にユーザーと合意した方針。むやみにダークモード対応を追加しない
- `docs/archive/service-spec.md` 由来の料金・仕入れ上限のような「表示専用の値」を新しい画面に追加する場合も、Stripe等の実データソースとは独立管理であることをコード内コメントに明記する
