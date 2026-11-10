import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";

import {
  checkQueryServices,
  fileSystemReader,
  memoryReader,
  renderQueryServiceSection,
  renderViolations,
  type QueryServiceReport,
} from "../../scripts/ci/query-service-shape";
import { QUERY_SERVICE_SHAPE } from "../../scripts/ci/query-service-shape.config";
import {
  HIGH_RISK_LABEL,
  LABELER_CONFIG,
  parseLabelGlobs,
} from "../../scripts/ci/review-checklists";

const ROOT = path.resolve(__dirname, "../..");

const PATHS = {
  query: "src/queries/member-order-query-service.ts",
  implementation:
    "src/infrastructure/supabase/supabase-member-order-query-service.ts",
  composition: "src/composition/member-order-query.ts",
  test: "tests/integration/supabase-member-order-query-service.test.ts",
};

// 規則どおりの Query Service。各テストはここから1か所だけ崩す
const QUERY = `export interface MemberOrderQueryService {
  findCheckout(clerkUserId: string): Promise<CheckoutDto | null>;
  findCheckoutCompletedOrder(input: Input): Promise<CompletedDto | null>;
}
`;

const TEST = `describe("SupabaseMemberOrderQueryService.findCheckout", () => {
  it("取得できる", async () => {});
  it("他の会員のデータを取得できない", async () => {});
  it("存在しない", async () => {});
});

describe("SupabaseMemberOrderQueryService.findCheckoutCompletedOrder", () => {
  it("取得できる", async () => {});
  it("他の会員のデータを取得できない", async () => {});
  test("存在しない", async () => {});
});
`;

const NO_OVERRIDES = { overrides: {} };

function check(
  overrides: Record<string, string | null> = {},
  config: Parameters<typeof checkQueryServices>[1] = NO_OVERRIDES
) {
  const files: Record<string, string | null> = {
    [PATHS.query]: QUERY,
    [PATHS.implementation]: "",
    [PATHS.composition]: "",
    [PATHS.test]: TEST,
    ...overrides,
  };
  return checkQueryServices(
    memoryReader(
      Object.fromEntries(
        Object.entries(files).filter(
          (entry): entry is [string, string] => entry[1] !== null
        )
      )
    ),
    config
  );
}

const messages = (reports: QueryServiceReport[]) =>
  reports.flatMap((r) => r.violations.map((v) => v.message));

describe("checkQueryServices", () => {
  it("実装・組み立て・統合テストがそろい、メソッドごとに3つのテストがあれば違反なし", () => {
    expect(check()).toEqual([{ ...PATHS, violations: [] }]);
  });

  it("Sanity の実装は sanity- の統合テストと対応付ける", () => {
    const reports = check({
      [PATHS.implementation]: null,
      [PATHS.test]: null,
      "src/infrastructure/sanity/sanity-member-order-query-service.ts": "",
      "tests/integration/sanity-member-order-query-service.test.ts": TEST,
    });
    expect(messages(reports)).toEqual([]);
  });

  it.each([
    "src/queries/member-order-queries.ts",
    "src/queries/memberOrder-query-service.ts",
    "src/queries/member/member-order-query-service.ts",
  ])("ファイル名・置き場所が規則と違えば違反（%s）", (file) => {
    const reports = checkQueryServices(
      memoryReader({ [file]: QUERY }),
      NO_OVERRIDES
    );
    expect(messages(reports)).toEqual([
      expect.stringContaining("<対象>-query-service.ts"),
    ]);
  });

  it("interface <対象>QueryService が無ければ違反", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace("MemberOrderQueryService", "OrderQuery"),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("MemberOrderQueryService"),
    ]);
  });

  it.each([
    ["実装", PATHS.implementation],
    ["組み立て", PATHS.composition],
    ["統合テスト", PATHS.test],
  ])("%sのファイルが無ければ違反", (_, file) => {
    expect(messages(check({ [file]: null }))).toEqual([
      expect.stringContaining(file),
    ]);
  });

  it("Supabase と Sanity の両方に実装があれば違反", () => {
    const reports = check({
      "src/infrastructure/sanity/sanity-member-order-query-service.ts": "",
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("どちらか一方"),
    ]);
  });

  it("メソッドの describe が無ければ違反（名前が前方一致する別メソッドの describe は数えない）", () => {
    const reports = check({
      [PATHS.test]: TEST.replace(
        'QueryService.findCheckout"',
        'QueryService.somethingElse"'
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringMatching(/findCheckout\b.*describe/),
    ]);
  });

  it("テストが3つ未満なら違反。skip・todo・describe.skip の中は数えない", () => {
    const reports = check({
      [PATHS.test]: TEST.replace('it("存在しない"', 'it.skip("存在しない"')
        .replace('it("取得できる"', 'it.todo("取得できる"')
        .replace(
          'describe("SupabaseMemberOrderQueryService.findCheckoutCompletedOrder"',
          'describe.skip("SupabaseMemberOrderQueryService.findCheckoutCompletedOrder"'
        ),
    });
    expect(messages(reports)).toEqual([
      expect.stringMatching(/findCheckout\b.*1/),
      expect.stringContaining("findCheckoutCompletedOrder"),
    ]);
  });

  it("it.each・skipIf のテストも数える", () => {
    const reports = check({
      [PATHS.test]: TEST.replace(
        'it("存在しない"',
        'it.each([1])("存在しない %s"'
      ).replace('test("存在しない"', 'test.skipIf(false)("存在しない"'),
    });
    expect(messages(reports)).toEqual([]);
  });

  it("設定でテストのファイルと「他の会員」の観点を置き換えられる", () => {
    const other = "tests/unit/infrastructure/member-order.test.ts";
    const config = {
      overrides: {
        [PATHS.query]: {
          test: other,
          otherMember: "閲覧できないランクの商品が返らない",
          reason: "RLS が無い",
        },
      },
    };
    expect(
      check({ [PATHS.test]: null, [other]: TEST }, config)[0]
    ).toMatchObject({ test: other, violations: [] });
    expect(
      messages(check({ [PATHS.test]: null, [other]: "" }, config))[0]
    ).toContain("閲覧できないランクの商品が返らない");
  });

  it("対応する Query Service が無い設定は違反（消し忘れ）", () => {
    const reports = check(
      {},
      {
        overrides: {
          "src/queries/removed-query-service.ts": {
            otherMember: "x",
            reason: "y",
          },
        },
      }
    );
    expect(messages(reports)).toEqual([
      expect.stringContaining("src/queries/removed-query-service.ts"),
    ]);
  });
});

describe("renderViolations", () => {
  it("違反のファイルとメッセージ、architecture.md の節を出す。違反が無ければ空文字", () => {
    const output = renderViolations(check({ [PATHS.composition]: null }));
    expect(output).toContain(PATHS.composition);
    expect(output).toContain(
      "docs/ai-prompts/architecture.md の「Query Service」"
    );
    expect(renderViolations(check())).toBe("");
  });
});

describe("renderQueryServiceSection（PR Diff Summary）", () => {
  it("5ファイルのどれかが差分にあり、検査を満たした Query Service の実装のファイルを出す", () => {
    const section = renderQueryServiceSection(check(), [PATHS.test], {
      docUrl: (f) => `https://example/${f}`,
    });
    expect(section).toContain(
      "Query Service の形は CI で確認済み。見るのは業務の判定（domain の呼び出し）だけ"
    );
    expect(section).toContain(
      `[\`${PATHS.implementation}\`](https://example/${PATHS.implementation})`
    );
  });

  it("差分に無いもの・違反のあるものは出さない", () => {
    expect(
      renderQueryServiceSection(check(), ["src/app/page.tsx"], {})
    ).toBeNull();
    expect(
      renderQueryServiceSection(
        check({ [PATHS.composition]: null }),
        [PATHS.query],
        {}
      )
    ).toBeNull();
  });
});

describe("このリポジトリ", () => {
  it("今ある Query Service はすべて検査を通る", () => {
    const reports = checkQueryServices(
      fileSystemReader(ROOT),
      QUERY_SERVICE_SHAPE
    );
    expect(reports.length).toBeGreaterThan(0);
    expect(renderViolations(reports)).toBe("");
  });

  it("ファイルごとの設定（検査を弱められる）は high-risk の対象", () => {
    const globs = parseLabelGlobs(
      readFileSync(path.join(ROOT, LABELER_CONFIG), "utf8")
    )[HIGH_RISK_LABEL];
    expect(
      globs.some((glob) =>
        minimatch("scripts/ci/query-service-shape.config.ts", glob, {
          dot: true,
        })
      )
    ).toBe(true);
  });

  it.each([
    ["Taskfile.yml", "check"],
    [".github/workflows/deploy.yml", "lint"],
  ])("%s の %s で検査が走る", (file, section) => {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    const body = new RegExp(`\\n {2}${section}:\\n([\\s\\S]*?)\\n {2}\\S`).exec(
      text
    )?.[1];
    expect(body).toContain("pnpm -s tsx scripts/ci/query-service-shape.ts");
  });
});
