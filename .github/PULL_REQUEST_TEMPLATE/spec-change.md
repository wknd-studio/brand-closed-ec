<!--
docs/spec-driven-workflow.md フェーズ3・4用のPRテンプレート。
specs/NNN-topic/ の spec.md を追加・更新するPRで使う
（`?template=spec-change.md` をPR作成URLに付けると選択できる）。
「レビューの要点」の3項目が空欄だとCI（PR Review Summary）が失敗する。
-->

## レビューの要点

<!-- 人間が最初に読む欄。各項目は短く（1〜2行） -->

- **変わる振る舞い**: <!-- このspecで、利用者・運営者・システムから見て何が変わることになるか。1〜2行 -->
- **一番危ない箇所**: <!-- 解釈が分かれそうな受け入れ条件（`specs/NNN-topic/spec.md:行` と、なぜか）。無ければ「なし」 -->
- **人間に判断してほしいこと**: <!-- 無ければ「なし」 -->

## 変更内容

<!-- どの specs/NNN-topic/ の spec.md を追加・更新したか -->

## ビジネスレビュアー向けリンク

<!--
差分（Files changedタブ）ではなく、レンダリングされたファイルをそのまま読めるリンクを貼る。
例: https://github.com/wknd-studio/brand-closed-ec/blob/<このPRのブランチ名>/specs/NNN-topic/spec.md
-->

- [ ] 上記リンクを貼った

## レビュアーへのお願い

コメントは「Files changed」タブの行コメントではなく、下の **Conversation** タブに書いてください。

## チェック

- [ ] 受け入れ条件を「会員・運営者が確認できること」「システムが保証すること」の2区分で明記した
- [ ] 曖昧な点があれば `/speckit-clarify` で解消済み
