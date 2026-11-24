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
- `--color-primary-strong`: 白地の小さい文字（「必須」の印等）に使う濃いゴールド（`text-primary-strong`）。`--color-primary` は白地とのコントラストが約3.6:1で、小さい文字の基準（4.5:1）に届かない。4.5:1以上は `tests/unit/ui/color-tokens.test.ts` で検査している
- `--color-secondary`: 補助テキスト色
- `--color-neutral-50〜900`: 暖色寄りのウォームグレー。ボーダー・非活性テキスト・背景に使う（純グレーではない点に注意）
- `--color-info`: 請求書払いを表す紺（`text-info` `bg-info/5` 等）。バッジ・お知らせの文字にも使うため、白地で4.5:1以上を `tests/unit/ui/color-tokens.test.ts` で検査している
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
- `FormField`: ラベル・入力欄・項目ごとのエラー文言の組。`error` を渡すと入力欄の下に文言を出し、ラベルの `htmlFor` と `aria-describedby` を自動で結び付ける。子は `{(field) => <Input name="..." {...field} />}` のように受け取った属性を `Input` / `Select` に展開する。項目ごとのエラーを出すフォームは `<p id="...-error">` を手書きせずこれを使う。`required` でラベルの横に「必須」の印（ラベルの文字列・読み上げには含めない）、`hint` で入力のヒント（エラーのときはエラー文言に置き換わる）を出す。画面上部のエラーのまとめから項目へリンクするときは `id` を渡す（最初の利用は `/onboarding/plan`）
- `Table`（`TableHeader` / `TableBody` / `TableRow` / `TableHead` / `TableCell`）: 管理画面の一覧用テーブル。角丸の枠付きで、狭い画面では横スクロールする（最初の利用は `/admin/procurement/queue`）
- `Badge`: 状態・区分を示す小さなラベル。`tone`(neutral/primary/success/warning/danger/info)。請求書払いは `info`
- `Steps`: 手続きの進み具合（`steps` のラベルの配列と、今の位置 `current`（0始まり））。`<nav aria-label="お手続きの進み具合">` で囲み、今のステップに `aria-current="step"` を付ける（最初の利用はオンボーディング）
- `Alert`: お知らせの枠（「カートに追加しました」・上限超過のエラー・請求書の案内等）。`tone`(success/danger/warning/info/neutral)で色とアイコンが変わる。`role` は必須で、操作の結果を知らせるものは `status`、エラーは `alert`。`title`（太字の1行目）・本文（children）・右側の `action`（「カートを見る」等のリンク・ボタン）を置ける。`ref`・`tabIndex` を渡してフォーカスを移せる（最初の利用は `/onboarding/plan` のエラーのまとめ）。お知らせの枠を手書きしない
- `Breadcrumb`: パンくず。`items` に上の階層から `{ label, href }` を並べ、最後の項目が今のページ（リンクにせず `aria-current="page"`）。`<nav aria-label="パンくずリスト">` の中の `<ol>` になる（ブランドのページ・商品詳細で使う）
- `QuantityStepper`: 数量の増減。`label`（group の読み上げ名。例:「レザートートバッグの数量」）・`value`・`onChange`。`size` は `md`（商品詳細。高さ52px、Button の md と同じ）と `sm`（カート。40px）。`min`（既定1）では「減らす」を、`disabled` のときは両方を押せなくする
- `ChoiceCard`: ラジオボタンを中に置いて、カード全体で選ばせる `<label>`。選ばれた（ゴールドの枠・薄いグラデーション）・キーボードのフォーカスがある見た目は、中の入力欄の状態（`:has`）から付くため、選択状態を props で渡さない。中の要素は `group-has-checked:` で選ばれたときの見た目を変えられる。余白・並びは `className` で足す（最初の利用は `/onboarding/account-type`）。オンボーディングのステップのラベルは `src/app/onboarding/onboarding-steps.ts` の `ONBOARDING_STEPS` を使う

## トークンの一覧（Storybook）

- `Foundations/Colors`・`Foundations/Typography`（`src/components/ui/foundations/`）に、色・フォント・`Heading` の各 `level` を見本付きで並べている。値は見本の要素の計算済みのスタイルから読むので、`globals.css` と二重に書かない。トークンを足したら、ここに名前と使いどころを足す

## Clerk のコンポーネントの見た目

- `<Waitlist>`・`<SignIn>`・`<SignUp>` をカードの中に置くときは、`src/components/auth/clerk-appearance.ts` の `clerkAppearance` を `appearance` に渡す。画面ごとに `appearance` を書き直さない

## 注意事項

- 新規プリミティブ・トークンを追加した場合は、このSKILL.mdのカタログを更新すること（陳腐化を防ぐため）
- ブランドの世界観（白ベース+ゴールドアクセント、OSのダークモード設定に関わらず常時ライト表示）はHOME画面刷新時にユーザーと合意した方針。むやみにダークモード対応を追加しない
- `docs/archive/service-spec.md` 由来の料金・仕入れ上限のような「表示専用の値」を新しい画面に追加する場合も、Stripe等の実データソースとは独立管理であることをコード内コメントに明記する
