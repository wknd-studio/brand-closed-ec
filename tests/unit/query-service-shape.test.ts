import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  checkQueryServices,
  fileSystemReader,
  memoryReader,
  renderQueryServiceSection,
  renderViolations,
  type QueryServiceReport,
} from "../../scripts/ci/query-service-shape";
import { QUERY_SERVICE_SHAPE } from "../../scripts/ci/query-service-shape.config";
import { minimatch } from "minimatch";
import {
  HIGH_RISK_LABEL,
  LABELER_CONFIG,
  parseLabelGlobs,
} from "../../scripts/ci/review-checklists";

const ROOT = path.resolve(__dirname, "../..");

// 規則どおりの Query Service（Supabase）。各テストはここから1か所だけ崩す
const QUERY = `import type { MemberRank } from "@/domain/value-objects/member-rank";

export type ProductAvailability = "available" | "out_of_stock";

export type OrderItemDto = { id: string };

export type InvoiceRequestedOrderDto = {
  orderId: string;
  rank: MemberRank;
  items: OrderItemDto[];
};

export type OrderHistoryDto = { orderId: string };

export interface MemberOrderQueryService {
  findInvoiceRequestedOrder(input: {
    clerkUserId: string;
    orderId: string;
  }): Promise<InvoiceRequestedOrderDto | null>;
  findOrderHistory(clerkUserId: string): Promise<OrderHistoryDto[]>;
}
`;

const IMPLEMENTATION = `import type { MemberOrderQueryService } from "@/queries/member-order-query-service";

export class SupabaseMemberOrderQueryService implements MemberOrderQueryService {
  async findInvoiceRequestedOrder() { return null; }
  async findOrderHistory() { return []; }
}
`;

const COMPOSITION = `import { SupabaseMemberOrderQueryService } from "@/infrastructure/supabase/supabase-member-order-query-service";
import type { MemberOrderQueryService } from "@/queries/member-order-query-service";

export async function memberOrderQueryService(): Promise<MemberOrderQueryService> {
  return new SupabaseMemberOrderQueryService(await createServerClient());
}
`;

const TEST = `import { describe, it } from "vitest";

describe("SupabaseMemberOrderQueryService.findInvoiceRequestedOrder", () => {
  it("取得できる", async () => {});
  it("他の会員の注文は null", async () => {});
  it("存在しない注文は null", async () => {});
});

describe("SupabaseMemberOrderQueryService.findOrderHistory", () => {
  it("取得できる", async () => {});
  describe("他の会員", () => {
    it("他の会員の注文を含めない", async () => {});
  });
  test("注文が無ければ空", async () => {});
});
`;

const PATHS = {
  query: "src/queries/member-order-query-service.ts",
  implementation:
    "src/infrastructure/supabase/supabase-member-order-query-service.ts",
  composition: "src/composition/member-order-query.ts",
  test: "tests/integration/supabase-member-order-query-service.test.ts",
};

function files(overrides: Record<string, string | null> = {}) {
  const all: Record<string, string | null> = {
    [PATHS.query]: QUERY,
    [PATHS.implementation]: IMPLEMENTATION,
    [PATHS.composition]: COMPOSITION,
    [PATHS.test]: TEST,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(all).filter((entry): entry is [string, string] =>
      Boolean(entry[1])
    )
  );
}

const NO_OVERRIDES = { overrides: {} };

function check(
  overrides: Record<string, string | null> = {},
  config: Parameters<typeof checkQueryServices>[1] = NO_OVERRIDES
) {
  return checkQueryServices(memoryReader(files(overrides)), config);
}

function messages(reports: QueryServiceReport[]) {
  return reports.flatMap((r) => r.violations.map((v) => v.message));
}

describe("checkQueryServices（規則どおり）", () => {
  it("interface・実装・組み立て・統合テストが規則どおりなら違反なし", () => {
    const reports = check();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      query: PATHS.query,
      implementation: PATHS.implementation,
      composition: PATHS.composition,
      test: PATHS.test,
      violations: [],
    });
  });

  it("Sanity の実装は sanity- の実装・統合テストと対応付ける", () => {
    const reports = checkQueryServices(
      memoryReader({
        "src/queries/catalog-query-service.ts": `export type BrandSummaryDto = { brand: string };
export interface CatalogQueryService {
  findBrands(): Promise<BrandSummaryDto[]>;
}
`,
        "src/infrastructure/sanity/sanity-catalog-query-service.ts": `import type { CatalogQueryService } from "@/queries/catalog-query-service";
export class SanityCatalogQueryService implements CatalogQueryService {}
`,
        "src/composition/catalog-query.ts": `import type { CatalogQueryService } from "@/queries/catalog-query-service";
export const catalogQueryService = (): CatalogQueryService => new SanityCatalogQueryService();
`,
        "tests/integration/sanity-catalog-query-service.test.ts": `describe("findBrands", () => { it("a"); it("b"); it("c"); });`,
      }),
      NO_OVERRIDES
    );
    expect(reports[0]).toMatchObject({
      implementation:
        "src/infrastructure/sanity/sanity-catalog-query-service.ts",
      test: "tests/integration/sanity-catalog-query-service.test.ts",
      violations: [],
    });
  });

  it("src/queries に Query Service が無ければ何も返さない", () => {
    expect(checkQueryServices(memoryReader({}), NO_OVERRIDES)).toEqual([]);
  });
});

describe("checkQueryServices（interface と DTO の命名）", () => {
  it("ファイル名が <対象>-query-service.ts でなければ違反", () => {
    const reports = checkQueryServices(
      memoryReader({ "src/queries/member-order-queries.ts": QUERY }),
      NO_OVERRIDES
    );
    expect(messages(reports)).toEqual([
      expect.stringContaining("<対象>-query-service.ts"),
    ]);
  });

  it("ファイル名がケバブケースでなければ違反", () => {
    const reports = checkQueryServices(
      memoryReader({ "src/queries/memberOrder-query-service.ts": QUERY }),
      NO_OVERRIDES
    );
    expect(messages(reports)).toEqual([
      expect.stringContaining("<対象>-query-service.ts"),
    ]);
  });

  it("interface の名前が <対象>QueryService でなければ違反", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace(
        "interface MemberOrderQueryService",
        "interface OrderQueryService"
      ),
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("interface MemberOrderQueryService")
    );
  });

  it("メソッド名が find<画面・用途> でなければ違反", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace("findOrderHistory(", "getOrderHistory("),
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("getOrderHistory")
    );
  });

  it("メソッドをプロパティ（関数型）で書いていれば違反", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace(
        "findOrderHistory(clerkUserId: string): Promise<OrderHistoryDto[]>;",
        "findOrderHistory: (clerkUserId: string) => Promise<OrderHistoryDto[]>;"
      ),
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("findOrderHistory")
    );
  });

  it("戻り値が Promise<…Dto> でなければ違反", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace(
        "Promise<OrderHistoryDto[]>",
        "Promise<string[]>"
      ),
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("findOrderHistory")
    );
  });

  it("戻り値の DTO が同じファイルに無ければ違反", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace(
        "Promise<OrderHistoryDto[]>",
        "Promise<OtherDto[]>"
      ),
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("OtherDto")
    );
  });

  it("オブジェクトの形の型の名前が <画面・用途>Dto でなければ違反（union 等の型は対象外）", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace(
        "export type OrderItemDto = { id: string };",
        "export type OrderItem = { id: string };"
      ).replace("items: OrderItemDto[]", "items: OrderItem[]"),
    });
    expect(messages(reports)).toEqual([expect.stringContaining("OrderItem")]);
  });

  it("domain 以外を import していれば違反", () => {
    const reports = check({
      [PATHS.query]:
        `import type { Database } from "@/types/database.types";\n` + QUERY,
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("@/types/database.types"),
    ]);
  });
});

describe("checkQueryServices（実装）", () => {
  it("実装のファイルが無ければ違反", () => {
    const reports = check({ [PATHS.implementation]: null });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining(PATHS.implementation)
    );
  });

  it("Supabase と Sanity の両方に実装があれば違反", () => {
    const reports = check({
      "src/infrastructure/sanity/sanity-member-order-query-service.ts":
        IMPLEMENTATION,
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("どちらか一方")
    );
  });

  it("クラス名が Supabase<対象>QueryService でなければ違反", () => {
    const reports = check({
      [PATHS.implementation]: IMPLEMENTATION.replace(
        "class SupabaseMemberOrderQueryService",
        "class MemberOrderQueryServiceImpl"
      ),
    });
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("SupabaseMemberOrderQueryService")
    );
  });

  it("クラスが interface を implements していなければ違反", () => {
    const reports = check({
      [PATHS.implementation]: IMPLEMENTATION.replace(
        " implements MemberOrderQueryService",
        ""
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("implements MemberOrderQueryService"),
    ]);
  });

  it("interface を src/queries から import していなければ違反", () => {
    const reports = check({
      [PATHS.implementation]: IMPLEMENTATION.replace(
        "@/queries/member-order-query-service",
        "@/somewhere/else"
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("@/queries/member-order-query-service"),
    ]);
  });
});

describe("checkQueryServices（組み立て）", () => {
  it("組み立てのファイルが無ければ違反", () => {
    const reports = check({ [PATHS.composition]: null });
    expect(messages(reports)).toEqual([
      expect.stringContaining(PATHS.composition),
    ]);
  });

  it("実装のクラスの型で返していれば違反", () => {
    const reports = check({
      [PATHS.composition]: COMPOSITION.replace(
        "Promise<MemberOrderQueryService>",
        "Promise<SupabaseMemberOrderQueryService>"
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("MemberOrderQueryService"),
    ]);
  });

  it("戻り値の型を書いていなければ違反", () => {
    const reports = check({
      [PATHS.composition]: COMPOSITION.replace(
        ": Promise<MemberOrderQueryService>",
        ""
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("MemberOrderQueryService"),
    ]);
  });

  it("interface の型で返すアロー関数の export も認める", () => {
    const reports = check({
      [PATHS.composition]: `import type { MemberOrderQueryService } from "@/queries/member-order-query-service";
export const memberOrderQueryService = (): MemberOrderQueryService => new X();
`,
    });
    expect(messages(reports)).toEqual([]);
  });
});

describe("checkQueryServices（統合テスト）", () => {
  it("統合テストのファイルが無ければ違反", () => {
    const reports = check({ [PATHS.test]: null });
    expect(messages(reports)).toEqual([expect.stringContaining(PATHS.test)]);
  });

  it("メソッドの describe が無ければ違反", () => {
    const reports = check({
      [PATHS.test]: TEST.replace(".findOrderHistory", ".somethingElse"),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("findOrderHistory"),
    ]);
  });

  it("メソッドの describe のテストが3つ未満なら違反", () => {
    const reports = check({
      [PATHS.test]: TEST.replace(
        `  test("注文が無ければ空", async () => {});\n`,
        ""
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringMatching(/findOrderHistory.*2/),
    ]);
  });

  it("skip・todo のテストは数えない", () => {
    const reports = check({
      [PATHS.test]: TEST.replace(
        `test("注文が無ければ空"`,
        `test.skip("注文が無ければ空"`
      ).replace(
        `it("存在しない注文は null"`,
        `it.todo("存在しない注文は null"`
      ),
    });
    expect(messages(reports)).toHaveLength(2);
  });

  it("describe.skip の中のテストは数えない", () => {
    const reports = check({
      [PATHS.test]: TEST.replace(
        `describe("SupabaseMemberOrderQueryService.findOrderHistory"`,
        `describe.skip("SupabaseMemberOrderQueryService.findOrderHistory"`
      ),
    });
    expect(messages(reports)).toEqual([
      expect.stringContaining("findOrderHistory"),
    ]);
  });

  it("名前が前方一致する別のメソッドの describe はそのメソッドのものとして数えない", () => {
    const reports = check({
      [PATHS.query]: QUERY.replace(
        "findOrderHistory(clerkUserId: string): Promise<OrderHistoryDto[]>;",
        "findOrderHistory(clerkUserId: string): Promise<OrderHistoryDto[]>;\n  findOrder(id: string): Promise<OrderHistoryDto | null>;"
      ),
    });
    expect(messages(reports)).toEqual([expect.stringContaining("findOrder")]);
  });

  it("it.each・describe.each・skipIf のテストも数える", () => {
    const reports = check({
      [PATHS.test]: `describe.skipIf(false)("findInvoiceRequestedOrder", () => {
  it.each([1, 2, 3])("%s", async () => {});
  it.only("a", () => {});
  it.concurrent("b", () => {});
});
describe.each([1])("findOrderHistory %s", () => {
  it("a", () => {}); it("b", () => {}); it.skipIf(false)("c", () => {});
});
`,
    });
    expect(messages(reports)).toEqual([]);
  });

  it("メッセージに3つの観点を出し、置き換えの設定があれば置き換えた観点を出す", () => {
    const missing = { [PATHS.test]: TEST.replace(".findOrderHistory", ".x") };
    expect(messages(check(missing))[0]).toContain(
      "取得できる・他の会員のデータを取得できない・存在しない"
    );
    const replaced = check(missing, {
      overrides: {
        [PATHS.query]: {
          otherMember: "閲覧できないランクの商品が返らない",
          reason: "RLS が無い",
        },
      },
    });
    expect(messages(replaced)[0]).toContain(
      "取得できる・閲覧できないランクの商品が返らない・存在しない"
    );
  });
});

describe("checkQueryServices（ファイルごとの設定）", () => {
  it("設定でテストのファイルを置き換えられる", () => {
    const other = "tests/unit/infrastructure/member-order-query.test.ts";
    const reports = check(
      { [PATHS.test]: null, [other]: TEST },
      {
        overrides: {
          [PATHS.query]: {
            test: other,
            otherMember: "他の会員",
            reason: "理由",
          },
        },
      }
    );
    expect(reports[0]).toMatchObject({ test: other, violations: [] });
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
    expect(messages(reports)).toContainEqual(
      expect.stringContaining("src/queries/removed-query-service.ts")
    );
  });
});

describe("renderViolations", () => {
  it("違反のファイル・足りないもの・直し方・architecture.md の節を出す", () => {
    const output = renderViolations(check({ [PATHS.composition]: null }));
    expect(output).toContain(PATHS.query);
    expect(output).toContain(PATHS.composition);
    expect(output).toContain("直し方");
    expect(output).toContain("docs/ai-prompts/architecture.md");
    expect(output).toContain("「Query Service」");
  });

  it("違反が無ければ空文字", () => {
    expect(renderViolations(check())).toBe("");
  });
});

describe("renderQueryServiceSection（PR Diff Summary）", () => {
  it("差分に含まれ、検査を満たした Query Service の実装のファイルを出す", () => {
    const section = renderQueryServiceSection(check(), [PATHS.query], {
      docUrl: (f) => `https://example/${f}`,
    });
    expect(section).toContain(
      "Query Service の形は CI で確認済み。見るのは業務の判定（domain の呼び出し）だけ"
    );
    expect(section).toContain(
      `[\`${PATHS.implementation}\`](https://example/${PATHS.implementation})`
    );
  });

  it("実装・テスト等の5ファイルのどれかが差分に含まれれば出す", () => {
    expect(renderQueryServiceSection(check(), [PATHS.test], {})).toContain(
      `\`${PATHS.implementation}\``
    );
  });

  it("差分に含まれない Query Service は出さない", () => {
    expect(
      renderQueryServiceSection(check(), ["src/app/page.tsx"], {})
    ).toBeNull();
  });

  it("違反のある Query Service は出さない（検査が失敗する）", () => {
    expect(
      renderQueryServiceSection(
        check({ [PATHS.composition]: null }),
        [PATHS.query],
        {}
      )
    ).toBeNull();
  });
});

describe("このリポジトリの Query Service", () => {
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
});
