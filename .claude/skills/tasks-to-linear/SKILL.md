---
name: "tasks-to-linear"
description: "spec-kitのtasks.mdをこのリポジトリのLinear(BRANDチーム)issueに変換する。同梱のspeckit-taskstoissuesはGitHub Issues専用のため、Linear向けの代替として自作。"
argument-hint: "Optional filter, e.g. a task ID range"
compatibility: "Requires spec-kit project structure with .specify/ directory, and Linear MCP tools"
user-invocable: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from the repo root and parse `FEATURE_DIR`（例: `specs/007-account-suspension`）と`tasks.md`のパス。すべてのパスは絶対パスにする。

2. `FEATURE_DIR`のディレクトリ名（例: `007-account-suspension`）を「フィーチャースラッグ」として控える。Linear issueの検索・重複防止に使う。

3. `tasks.md` を読み込み、各タスク行を抽出する。フォーマットは `- [ ] T001 [P] [US1] 説明文` （spec-kitのタスクテンプレート準拠）。先頭の `- [ ]`・`[P]`・`[US#]` マーカーを取り除き、タスクID（`T` + 3桁の数字）と説明文を復元する。

4. **重複防止のため既存issueを検索する**: `mcp__linear__list_issues` を `team: "BRAND"`, `query: "<フィーチャースラッグ>"` で呼び出す（`includeArchived: true` で完了済みも含める）。返ってきた各issueのタイトルを `\bT\d{3}\b` パターンで照合し、すでに存在するタスクIDの集合を作る。

5. まだissueが存在しないタスクごとに、`mcp__linear__save_issue` で新規issueを作成する。
   - `team`: `"BRAND"`
   - `title`: `[<フィーチャースラッグ>] T001: <説明文>`（IDは1回だけ、フィーチャースラッグを角括弧で前置する）
   - `description`: どの仕様に基づくタスクかを明記する。最低限 `specs/<フィーチャースラッグ>/spec.md` ・`plan.md` ・`tasks.md` へのパスを含める
   - `state`: `"Backlog"`
   - 既にissueが存在するタスクは**スキップ**し、`T001はすでにissueがあるためスキップ` のように報告する

6. 完了後、作成したissueの一覧（Linear URL付き）と、スキップしたタスクの一覧をレポートする。

## 注意事項

- このスキルはこのリポジトリ固有の配線（Linearの`BRAND`チーム）に依存している。他プロジェクトへの転用時はチーム名を要変更
- タスクの依存関係（`tasks.md`内のPhase分け等）はissueの本文に転記するのみとし、Linear側の`blockedBy`等の関係設定は行わない（必要になった場合は別途検討）
- `docs/overview.md` のリンク更新（フェーズ7）はこのスキルの範囲外。別タスクで対応する
