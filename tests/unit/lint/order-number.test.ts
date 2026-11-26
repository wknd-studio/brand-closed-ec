import { ESLint } from "eslint";
import { describe, it, expect } from "vitest";

// 注文IDから注文番号を作る書き方のlint（#755）の回帰テスト。実際の eslint.config.mjs を読み込み、
// 対象のファイルとして lintText に渡す。注文番号は orders.order_number（#754）を OrderNumber で
// 表示の形にして出す。注文IDの先頭を切り出して番号にすると、画面ごとに番号が食い違う

const eslint = new ESLint();

async function orderNumberMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m) =>
      m.ruleId === "no-restricted-syntax" && m.message.includes("OrderNumber")
  );
}

// no-restricted-syntax は後のブロックが置き換えるため、ブロックごとのファイルで確かめる
const FILES = [
  "src/app/admin/sample/page.tsx",
  // デザイントークンの検査の対象外（移行前）のファイル
  "src/app/admin/orders/page.tsx",
  "src/components/sample.tsx",
  "src/middleware.ts",
  "src/queries/sample.ts",
  "src/infrastructure/supabase/sample-query-service.ts",
  "src/infrastructure/resend/sample.ts",
];

const violations = [
  {
    name: "注文IDの先頭8文字",
    code: `export const f = (orderId: string) => orderId.slice(0, 8).toUpperCase();\n`,
  },
  {
    name: "注文の id の先頭8文字",
    code: `export const f = (order: { id: string }) => order.id.slice(0, 8);\n`,
  },
  {
    name: "明細の orderId の先頭8文字",
    code: `export const f = (item: { orderId: string }) => item.orderId.slice(0, 8);\n`,
  },
  {
    name: "DBの行の order_id の substring",
    code: `export const f = (row: { order_id: string }) => row.order_id.substring(0, 8);\n`,
  },
  {
    name: "id の substr",
    code: `export const f = (id: string) => id.substr(0, 8);\n`,
  },
];

describe("注文IDから注文番号を作る書き方（#755）", () => {
  describe.each(FILES)("%s", (file) => {
    it.each(violations)("$name は失敗する", async ({ code }) => {
      expect(await orderNumberMessages(file, code)).toHaveLength(1);
    });
  });

  it.each([
    {
      name: "注文番号の値オブジェクト",
      code: `export const f = (n: { display(): string }) => n.display();\n`,
    },
    {
      name: "ID以外の文字列の slice",
      code: `export const f = (key: string) => key.slice("quantity:".length);\n`,
    },
    {
      name: "IDで終わらない名前の slice",
      code: `export const f = (video: string) => video.slice(0, 8);\n`,
    },
    {
      name: "配列の slice",
      code: `export const f = (ids: string[]) => ids.slice(0, 8);\n`,
    },
  ])("$name は失敗しない", async ({ code }) => {
    expect(
      await orderNumberMessages("src/app/admin/sample/page.tsx", code)
    ).toEqual([]);
  });

  it("メッセージで OrderNumber の表示の形を使うよう示す", async () => {
    const [message] = await orderNumberMessages(
      "src/app/admin/sample/page.tsx",
      violations[0].code
    );
    expect(message.message).toContain("display()");
  });

  it("src/ の外（テスト・scripts）は対象外", async () => {
    for (const file of ["tests/e2e/sample.spec.ts", "scripts/sample.ts"]) {
      expect(await orderNumberMessages(file, violations[0].code)).toEqual([]);
    }
  });
});
