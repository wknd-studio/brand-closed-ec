import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/ci/check-pr-review-summary.sh"
);

// スクリプトをsourceして判定関数だけを呼ぶ（GitHub APIには触れない）
function judge(body: string) {
  const result = spawnSync(
    "bash",
    ["-c", 'source "$0" && judge_pr_review_summary', SCRIPT],
    { encoding: "utf8", input: body }
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

function template(file: string) {
  return readFileSync(path.resolve(__dirname, "../../.github", file), "utf8");
}

// 「レビューの要点」の節を組み立てる。各項目の値はラベルの後ろにそのまま続ける
function summary(items: {
  behavior?: string;
  risk?: string;
  decision?: string;
}) {
  return [
    "## 関連issue",
    "",
    "Closes #471",
    "",
    "## レビューの要点",
    "",
    "<!-- 人間が最初に読む欄 -->",
    "",
    `- **変わる振る舞い**: ${items.behavior ?? "PR本文の冒頭に要点の欄が増える"}`,
    `- **一番危ない箇所**: ${items.risk ?? "`scripts/ci/check-pr-review-summary.sh:20` 判定が緩いと空欄を通す"}`,
    `- **人間に判断してほしいこと**: ${items.decision ?? "なし"}`,
    "",
    manualCheck({}),
    "",
    "## 目的（1行）",
    "",
    "要点を先に読めるようにする",
  ].join("\n");
}

// 「動作確認の手順」の節を組み立てる（#711）。手順は番号付きの続きの行に書く
function manualCheck(items: {
  need?: string;
  prep?: string;
  account?: string;
  steps?: string;
}) {
  return [
    "## 動作確認の手順",
    "",
    "<!-- 人間がPRを開けば聞かずに確かめられるように書く -->",
    "",
    `- **手動確認**: ${items.need ?? "要（マージ前）"}`,
    `- **準備**: ${items.prep ?? "ブランチ `feature/711-pr-manual-check`。`supabase db reset` は不要"}`,
    `- **アカウント**: ${items.account ?? "info+test_admin1@wknd-studio.com"}`,
    `- **手順と期待する結果**:${items.steps ?? "\n  1. `/admin` を開く → 管理画面が表示される"}`,
  ].join("\n");
}

// 「レビューの要点」と「動作確認の手順」の両方を持つ本文。動作確認の手順だけを差し替える
function bodyWith(items: Parameters<typeof manualCheck>[0]) {
  return summary({}).replace(manualCheck({}), manualCheck(items));
}

describe("judge_pr_review_summary", () => {
  it("3項目が埋まっていれば成功する", () => {
    expect(judge(summary({})).status).toBe(0);
  });

  it("「なし」は記入済みとして扱う", () => {
    expect(
      judge(summary({ behavior: "なし", risk: "なし", decision: "なし" }))
        .status
    ).toBe(0);
  });

  it("空欄の項目を検出し、項目名を出す", () => {
    const { status, output } = judge(summary({ risk: "" }));
    expect(status).toBe(1);
    expect(output).toContain("一番危ない箇所");
    expect(output).not.toContain("変わる振る舞い が");
  });

  it("テンプレートのコメントだけの項目は空欄として扱う", () => {
    const { status, output } = judge(
      summary({ decision: "<!-- 無ければ「なし」 -->" })
    );
    expect(status).toBe(1);
    expect(output).toContain("人間に判断してほしいこと");
  });

  it("複数行にまたがるコメントだけの項目も空欄として扱う", () => {
    const { status } = judge(
      summary({ behavior: "<!-- 利用者・運営者から見て\n  何が変わるか -->" })
    );
    expect(status).toBe(1);
  });

  it("コメントの後ろに書いた内容は記入済みとして扱う", () => {
    expect(
      judge(summary({ decision: "<!-- 無ければ「なし」 --> 名前の付け方" }))
        .status
    ).toBe(0);
  });

  it("次の行に続けて書いた内容は記入済みとして扱う", () => {
    expect(
      judge(summary({ behavior: "\n  会員から見た変化は無い" })).status
    ).toBe(0);
  });

  it("全角コロン・太字の内側のコロンでも判定できる", () => {
    const full = summary({}).replace(
      "**変わる振る舞い**:",
      "**変わる振る舞い**："
    );
    expect(judge(full).status).toBe(0);
    expect(judge(full.replace(/(変わる振る舞い\*\*：).*$/m, "$1")).status).toBe(
      1
    );
    const inner = summary({}).replace(
      "**変わる振る舞い**:",
      "**変わる振る舞い：**"
    );
    expect(judge(inner).status).toBe(0);
    expect(
      judge(inner.replace(/(変わる振る舞い：\*\*).*$/m, "$1")).status
    ).toBe(1);
  });

  it("空白だけの項目は空欄として扱う", () => {
    expect(judge(summary({ behavior: "   " })).status).toBe(1);
  });

  it("CRLF改行の本文（GitHubの画面で編集した本文）も判定できる", () => {
    expect(judge(summary({}).replace(/\n/g, "\r\n")).status).toBe(0);
    expect(judge(summary({ risk: "" }).replace(/\n/g, "\r\n")).status).toBe(1);
  });

  it("項目の行が無ければ失敗する", () => {
    const body = summary({}).replace(/^- \*\*一番危ない箇所\*\*.*$/m, "");
    const { status, output } = judge(body);
    expect(status).toBe(1);
    expect(output).toContain("一番危ない箇所");
  });

  it("「レビューの要点」の節が無ければ失敗する", () => {
    const { status, output } = judge("## 関連issue\n\nCloses #471\n");
    expect(status).toBe(1);
    expect(output).toContain("レビューの要点");
  });

  it("本文が空なら失敗する", () => {
    expect(judge("").status).toBe(1);
  });

  it("別の節にある同名の項目は数えない", () => {
    const body = summary({ risk: "" }).replace(
      "要点を先に読めるようにする",
      "- **一番危ない箇所**: ここに書いても要点の欄は埋まらない"
    );
    expect(judge(body).status).toBe(1);
  });

  it.each(["pull_request_template.md", "PULL_REQUEST_TEMPLATE/spec-change.md"])(
    "%s を埋めずにそのまま使うと失敗する",
    (file) => {
      const { status, output } = judge(template(file));
      expect(status).toBe(1);
      expect(output).toContain("変わる振る舞い");
      expect(output).toContain("一番危ない箇所");
      expect(output).toContain("人間に判断してほしいこと");
    }
  );
});

describe("judge_pr_review_summary の「動作確認の手順」（#711）", () => {
  it.each(["要（マージ前）", "要（stg）", "`要（stg）`", "要(マージ前)"])(
    "手動確認が %s で、準備・アカウント・手順が埋まっていれば成功する",
    (need) => {
      expect(judge(bodyWith({ need })).status).toBe(0);
    }
  );

  it.each(["prep", "account", "steps"] as const)(
    "手動確認が要のとき、%s が空欄なら失敗し、項目名を出す",
    (key) => {
      const label = {
        prep: "準備",
        account: "アカウント",
        steps: "手順と期待する結果",
      }[key];
      for (const need of ["要（マージ前）", "要（stg）"]) {
        const { status, output } = judge(bodyWith({ need, [key]: "" }));
        expect(status).toBe(1);
        expect(output).toContain(`${label} が空欄`);
      }
    }
  );

  it("手動確認が不要で理由があれば、準備・アカウント・手順が空欄でも成功する", () => {
    const body = bodyWith({
      need: "不要（CIの設定だけ）",
      prep: "",
      account: "",
      steps: "",
    });
    expect(judge(body).status).toBe(0);
  });

  it("手動確認が不要でも、理由が無ければ失敗する", () => {
    for (const need of ["不要", "`不要`", "不要（）", "不要: "]) {
      const { status, output } = judge(
        bodyWith({ need, prep: "", account: "", steps: "" })
      );
      expect(status).toBe(1);
      expect(output).toContain("理由");
    }
  });

  it("手動確認が空欄なら失敗する", () => {
    const { status, output } = judge(bodyWith({ need: "" }));
    expect(status).toBe(1);
    expect(output).toContain("手動確認 が空欄");
  });

  it("テンプレートのコメントだけの手動確認は空欄として扱う", () => {
    const { status, output } = judge(
      bodyWith({
        need: "<!-- `要（マージ前）`・`要（stg）`・`不要` のどれか -->",
      })
    );
    expect(status).toBe(1);
    expect(output).toContain("手動確認 が空欄");
  });

  it.each(["要", "必要", "要（本番）", "済み", "あり"])(
    "手動確認が3つの値以外（%s）なら失敗する",
    (need) => {
      const { status, output } = judge(bodyWith({ need }));
      expect(status).toBe(1);
      expect(output).toContain("要（マージ前）");
    }
  );

  it("「動作確認の手順」の節が無ければ失敗する", () => {
    const { status, output } = judge(summary({}).replace(manualCheck({}), ""));
    expect(status).toBe(1);
    expect(output).toContain("動作確認の手順");
  });

  it("項目の行が無ければ失敗する", () => {
    const body = summary({}).replace(/^- \*\*アカウント\*\*.*$/m, "");
    const { status, output } = judge(body);
    expect(status).toBe(1);
    expect(output).toContain("アカウント");
  });

  it("「レビューの要点」の空欄と一緒に、動作確認の手順の空欄も出す", () => {
    const body = summary({ risk: "" }).replace(
      manualCheck({}),
      manualCheck({ steps: "" })
    );
    const { status, output } = judge(body);
    expect(status).toBe(1);
    expect(output).toContain("一番危ない箇所");
    expect(output).toContain("手順と期待する結果");
  });

  it("CRLF改行の本文も判定できる", () => {
    expect(judge(bodyWith({}).replace(/\n/g, "\r\n")).status).toBe(0);
    expect(judge(bodyWith({ account: "" }).replace(/\n/g, "\r\n")).status).toBe(
      1
    );
  });

  it.each(["pull_request_template.md", "PULL_REQUEST_TEMPLATE/spec-change.md"])(
    "%s を埋めずにそのまま使うと、手動確認の空欄で失敗する",
    (file) => {
      const { status, output } = judge(template(file));
      expect(status).toBe(1);
      expect(output).toContain("手動確認 が空欄");
    }
  );
});

// 標準入力の本文から、needs-manual-check ラベルをどうするか（add / remove / none）を出す
function labelAction(env: {
  EVENT_ACTION: string;
  PR_BODY: string;
  PR_PREVIOUS_BODY?: string;
}) {
  const result = spawnSync(
    "bash",
    ["-c", 'source "$0" && manual_check_label_action', SCRIPT],
    { encoding: "utf8", env: { ...process.env, PR_PREVIOUS_BODY: "", ...env } }
  );
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe("manual_check_label_action（#711）", () => {
  const need = (v: string) =>
    bodyWith({
      need: v,
      ...(v.startsWith("不要") ? { prep: "", account: "", steps: "" } : {}),
    });

  it.each(["opened", "reopened"])(
    "%s のとき、手動確認が要ならラベルを付け、不要なら外す",
    (action) => {
      expect(
        labelAction({ EVENT_ACTION: action, PR_BODY: need("要（マージ前）") })
      ).toBe("add");
      expect(
        labelAction({ EVENT_ACTION: action, PR_BODY: need("要（stg）") })
      ).toBe("add");
      expect(
        labelAction({
          EVENT_ACTION: action,
          PR_BODY: need("不要（CIの設定だけ）"),
        })
      ).toBe("remove");
    }
  );

  it("手動確認が空欄・3つの値以外・理由の無い不要のときは、ラベルを変えない", () => {
    for (const v of ["", "要", "不要"]) {
      expect(labelAction({ EVENT_ACTION: "opened", PR_BODY: need(v) })).toBe(
        "none"
      );
    }
    expect(labelAction({ EVENT_ACTION: "opened", PR_BODY: "" })).toBe("none");
  });

  it("本文の編集で不要から要に書き換えたらラベルを付け、要から不要に書き換えたら外す", () => {
    expect(
      labelAction({
        EVENT_ACTION: "edited",
        PR_PREVIOUS_BODY: need("不要（CIの設定だけ）"),
        PR_BODY: need("要（stg）"),
      })
    ).toBe("add");
    expect(
      labelAction({
        EVENT_ACTION: "edited",
        PR_PREVIOUS_BODY: need("要（マージ前）"),
        PR_BODY: need("不要（CIの設定だけ）"),
      })
    ).toBe("remove");
  });

  it("本文を編集しても手動確認の要・不要が変わらなければ、ラベルを変えない（人間が外したラベルを付け直さない）", () => {
    expect(
      labelAction({
        EVENT_ACTION: "edited",
        PR_PREVIOUS_BODY: need("要（マージ前）"),
        PR_BODY: need("要（stg）"),
      })
    ).toBe("none");
    expect(
      labelAction({
        EVENT_ACTION: "edited",
        PR_PREVIOUS_BODY: need("不要（CIの設定だけ）"),
        PR_BODY: need("不要（ドキュメントだけ）"),
      })
    ).toBe("none");
  });

  it("編集前が空欄・不正な値で、編集後に要・不要を書いたらラベルを合わせる", () => {
    expect(
      labelAction({
        EVENT_ACTION: "edited",
        PR_PREVIOUS_BODY: need(""),
        PR_BODY: need("要（stg）"),
      })
    ).toBe("add");
    expect(
      labelAction({
        EVENT_ACTION: "edited",
        PR_PREVIOUS_BODY: need("要"),
        PR_BODY: need("不要（CIの設定だけ）"),
      })
    ).toBe("remove");
  });
});

type Workflow = {
  jobs: Record<
    string,
    {
      if?: string;
      concurrency?: unknown;
      permissions?: Record<string, string>;
      steps: { run?: string; env?: Record<string, string> }[];
    }
  >;
};

function workflow() {
  return parse(
    readFileSync(
      path.resolve(__dirname, "../../.github/workflows/pr-review-summary.yml"),
      "utf8"
    )
  ) as Workflow;
}

describe("pr-review-summary.yml のラベルのジョブ（#711）", () => {
  const jobs = Object.values(workflow().jobs);
  const labelJob = jobs.find((job) =>
    job.steps.some((s) => s.run?.includes("manual_check_label_action"))
  );

  it("ラベルを付け外しするジョブがある", () => {
    expect(labelJob).toBeDefined();
    expect(
      labelJob?.steps.some((s) => s.run?.includes("needs-manual-check"))
    ).toBe(true);
  });

  it("書き込みの権限はラベルのジョブだけに付け、本文の検査のジョブは読み取りだけにする", () => {
    expect(labelJob?.permissions?.["pull-requests"]).toBe("write");
    const checkJob = jobs.find((job) =>
      job.steps.some(
        (s) => s.run === "bash scripts/ci/check-pr-review-summary.sh"
      )
    );
    expect(checkJob?.permissions).toEqual({ contents: "read" });
  });

  it("fork のPR・Dependabot のPRではラベルのジョブを動かさない", () => {
    expect(labelJob?.if).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository"
    );
    expect(labelJob?.if).toContain("dependabot[bot]");
  });

  it("push・タイトルだけの編集・閉じたPRではラベルのジョブを動かさない", () => {
    expect(labelJob?.if).toContain("github.event.pull_request.state == 'open'");
    expect(labelJob?.if).toContain("github.event.action != 'synchronize'");
    expect(labelJob?.if).toContain(
      "(github.event.action != 'edited' || github.event.changes.body != null)"
    );
  });

  // ラベルを動かすのは opened か要・不要が変わった edited だけなので、
  // その実行が後の実行に取り消されると、ラベルが付かないまま残る
  it("ラベルのジョブは後の実行に取り消されない（取り消しは本文の検査のジョブだけ）", () => {
    const wf = workflow() as Workflow & { concurrency?: unknown };
    expect(wf.concurrency).toBeUndefined();
    expect(labelJob?.concurrency).toBeUndefined();
    const checkJob = jobs.find((job) =>
      job.steps.some(
        (s) => s.run === "bash scripts/ci/check-pr-review-summary.sh"
      )
    );
    expect(checkJob?.concurrency).toMatchObject({ "cancel-in-progress": true });
  });

  it("編集前の本文は、本文が変わった編集のときだけ渡す", () => {
    const step = labelJob?.steps.find((s) =>
      s.run?.includes("manual_check_label_action")
    );
    expect(step?.env?.PR_PREVIOUS_BODY).toBe(
      "${{ github.event.changes.body.from }}"
    );
    expect(step?.env?.PR_BODY).toBe("${{ github.event.pull_request.body }}");
    expect(step?.env?.EVENT_ACTION).toBe("${{ github.event.action }}");
  });
});

// ワークフローと同じく環境変数で本文・作成者を渡し、スクリプト全体を実行する
function run(env: { PR_BODY: string; PR_AUTHOR?: string }) {
  // テストを実行している環境の PR_AUTHOR を持ち込まない
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (env.PR_AUTHOR === undefined) delete childEnv.PR_AUTHOR;
  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: childEnv,
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

// Dependabot のセキュリティ更新のPRは issue 無しの例外で、本文の書き方を決まりに合わせられない（#668）
describe("Dependabot が作ったPR", () => {
  it("作成者が dependabot[bot] なら、本文が空でも成功扱いにする", () => {
    const { status, output } = run({
      PR_BODY: "",
      PR_AUTHOR: "dependabot[bot]",
    });
    expect(status).toBe(0);
    expect(output).toContain("Dependabot");
  });

  it.each(["wknd-studio", "dependabot", "github-actions[bot]", ""])(
    "作成者が %j なら、今までどおり本文を検査する",
    (author) => {
      expect(run({ PR_BODY: "", PR_AUTHOR: author }).status).toBe(1);
      expect(run({ PR_BODY: summary({}), PR_AUTHOR: author }).status).toBe(0);
    }
  );

  it("作成者を渡さなければ、今までどおり本文を検査する", () => {
    expect(run({ PR_BODY: "" }).status).toBe(1);
  });

  it("ワークフローは、実行した人ではなくPRの作成者を PR_AUTHOR に渡す", () => {
    const workflow = parse(
      readFileSync(
        path.resolve(
          __dirname,
          "../../.github/workflows/pr-review-summary.yml"
        ),
        "utf8"
      )
    ) as {
      jobs: Record<
        string,
        { steps: { run?: string; env?: Record<string, string> }[] }
      >;
    };
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .find((s) => s.run?.includes("check-pr-review-summary.sh"));
    expect(step?.env?.PR_AUTHOR).toBe(
      "${{ github.event.pull_request.user.login }}"
    );
  });
});

describe("pull_request_template.md", () => {
  const body = template("pull_request_template.md");

  it("「レビューの要点」が「関連issue」の直後にあり、その直後に「動作確認の手順」がある", () => {
    const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.slice(0, 3)).toEqual([
      "関連issue",
      "レビューの要点",
      "動作確認の手順",
    ]);
  });

  it.each([
    "受け入れ条件ごとの確認結果",
    "実行したチェック",
    "spec-reviewer の受け入れ条件の表",
  ])("根拠を示す節「%s」は <details> で折りたたまれている", (title) => {
    expect(body).toMatch(
      new RegExp(`<details>\\s*<summary>${title}[^<]*</summary>`)
    );
    expect(body).not.toMatch(new RegExp(`^## ${title}`, "m"));
  });
});

describe("PULL_REQUEST_TEMPLATE/spec-change.md", () => {
  it("「レビューの要点」の直後に「動作確認の手順」がある（#711）", () => {
    const headings = [
      ...template("PULL_REQUEST_TEMPLATE/spec-change.md").matchAll(
        /^## (.+)$/gm
      ),
    ].map((m) => m[1]);
    expect(headings.slice(0, 2)).toEqual(["レビューの要点", "動作確認の手順"]);
  });
});
