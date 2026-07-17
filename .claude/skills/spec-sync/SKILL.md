# service-spec.md ⇄ Linear タスク同期

`docs/service-spec.md` の変更点と Linear（BRAND チーム）のタスクを突き合わせ、新規に起票すべき項目・前提が古くなった既存issueをレポートする。Linear への書き込みは必ずユーザーの承認を得てから行う（全自動での作成・更新・close は禁止）。

## 手順

**Step 1: 前回の同期地点を確認する**

```bash
cat .claude/spec-sync-state.json
```

- ファイルがなければ初回実行として扱い、`docs/service-spec.md` に関する直近のコミット1件分の差分を対象にする

**Step 2: 差分を取得する**

```bash
git diff <前回のcommit SHA>..HEAD -- docs/service-spec.md
git diff HEAD -- docs/service-spec.md   # 未コミットの変更も含める
```

**Step 3: Linear の現行タスクを取得する**

- `mcp__linear__list_issues`（team: BRAND, limit: 250）で全件取得する
- 出力が大きくコンテキストを圧迫する場合は、タイトル・status・description のみ抽出して扱う（`Bash` + `python3` でJSONから必要フィールドだけ抜き出す）

**Step 4: 差分箇所と issue を突き合わせて分類する**

Step 2 の差分で変更・追加された記述ごとに、関連しそうな Linear issue をタイトル・description のキーワードで検索し、以下の3パターンに分類する。

- 🆕 仕様書に書かれているが Linear に対応 issue がない → 新規 issue 案を作成する
- ⚠️ 既存 issue の前提（受け入れ条件・description・canceled理由など）が新しい仕様と矛盾・陳腐化している → 更新案 or close 案を作成する
- ✅ 整合している → レポートには載せない

差分がない箇所まで全文を洗い直す必要はない。

**Step 5: レポートとして提示する**

- Linear には一切書き込まず、まず変更提案の一覧をユーザーに提示する
- 各項目について「新規 issue 化」「既存 issue の更新」「close」のどれを提案するか、既存issue（例: BRAND-54）のフォーマット（概要 / 受け入れ条件 / 実装方針）に沿って明記する
- 差分が仕様の意味を変えない修正（誤字・表記統一など）であれば「変更なし」として何も提案しない

**Step 6: ユーザーが承認したものだけ Linear に反映する**

- `mcp__linear__save_issue` 等で作成・更新する
- 一括承認ではなく、ユーザーが選んだ項目だけ反映する（Linear への書き込みは commit や push と同様に他者に見える操作のため、必ず個別承認を得る）

**Step 7: 同期地点を更新する**

Step 6 の反映が完了した後（レポートのみで終わった場合は差分をレビューした時点）で更新する。

```bash
echo '{"lastSyncedCommit": "'$(git rev-parse HEAD)'", "lastSyncedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > .claude/spec-sync-state.json
```

## 注意事項

- このスキルは「差分の検出」までは機械的に行うが、「その差分がどの issue に影響するか」の判断はコード同様レビューが必要。レポート提示までを自動化し、Linear への実書き込みは常に人間の承認を挟む
- `docs/service-spec.md` 以外のファイル（`docs/architecture-refactoring.md` 等）は対象外。将来対象を広げる場合はこのスキルを更新する
