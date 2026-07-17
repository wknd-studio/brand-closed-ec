# brand-closed-ec Constitution

## Core Principles

### I. エンジニアリング制約は CLAUDE.md を正とする（NON-NEGOTIABLE）

このプロジェクトのブランチ戦略・PRサイズ・テスト自動選択ルール・コミット形式・実装順序（理解度確認→テスト→実装→コミット）等のエンジニアリング制約は、すべてリポジトリ直下の `CLAUDE.md` に定義されている。`/speckit-plan` の Constitution Check では、生成した計画が `CLAUDE.md` の各ルールに違反していないかを確認すること。

本ファイルにはCLAUDE.mdの内容を複製しない。複製すると「2箇所に書いて片方が古くなる」問題が再発するため（`docs/spec-driven-workflow.md` 参照）。

### II. 受け入れ条件の明記（NON-NEGOTIABLE）

`spec.md` には必ず受け入れ条件を「会員・運営者（ビジネスサイド）が確認できること」「システムが保証すること」の2区分で明記する。曖昧な受け入れ条件のまま次工程に進まない。

### III. 曖昧さの解消を計画より先に行う

仕様に曖昧な点がある場合は `/speckit-clarify` で解消してから `/speckit-plan` に進む。曖昧なまま技術計画を作らない。

### IV. 実装記述と仕様意図の区別

`docs/` 配下・`specs/` 配下のドキュメントには「現在の実装を正確に記述するもの」と「これから実現したいあるべき仕様」の2種類がある。矛盾が見つかった場合、実装を記述したドキュメントを安易に書き換えてはならない。判断に迷う場合は、対応するLinear issueのstatus（Doneか否か）で判定する。

### V. 事実の単一情報源化

料金・ランク名・上限値等のデータ的事実は、可能な限りコード側の単一の定義箇所を正とし、ドキュメントはそこへの参照に留める（書き写さない）。複数のドキュメントに同じ事実を書き写すことを禁止する。

## 開発ワークフロー

仕様変更は `/speckit-specify` で `specs/NNN-topic/` に起票することから開始し、直接 `docs/` 配下の既存ファイルを書き換えない。`/speckit-tasks` で生成したタスクは、Linear連携スキルを通じて必ずLinear issueへ変換してから実装に着手する（詳細は `docs/spec-driven-workflow.md` 参照）。

## Governance

本Constitutionは `/speckit-plan` の Constitution Check で必ず参照される。改定はPRで行い、`CLAUDE.md` との内容重複を作らないことをレビュー観点に含める。

**Version**: 1.0.0 | **Ratified**: 2026-07-17 | **Last Amended**: 2026-07-17
