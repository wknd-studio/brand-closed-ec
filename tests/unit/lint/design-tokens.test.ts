import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { ESLint } from "eslint";
import { describe, it, expect } from "vitest";

import { DESIGN_TOKEN_LEGACY_FILES } from "../../../eslint.config.mjs";

// 画面のコードで Tailwind の既定の色・色の値の直書きを使わないlint（#781）の回帰テスト。
// 実際の eslint.config.mjs を読み込み、対象のファイルとして違反するコードを lintText に渡してエラーになることを確かめる

const RULE = "no-restricted-syntax";
const SKILL = ".claude/skills/design-system/SKILL.md";

const eslint = new ESLint();

async function designTokenMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === RULE && m.message.includes(SKILL)
  );
}

const component = (jsx: string) =>
  `export function Sample({ active, theme }: { active: boolean; theme: { primaryColorHex: string } }) {\n  return ${jsx};\n}\n`;

const FILES = [
  "src/app/(member)/sample/page.tsx",
  "src/app/sample-section.tsx",
  "src/components/sample.tsx",
];

describe("Tailwind の既定の色", () => {
  const forbidden = [
    { name: "文字の色", code: component(`<p className="text-gray-500">x</p>`) },
    {
      name: "状態の接頭辞付き",
      code: component(`<p className="p-2 hover:bg-red-600">x</p>`),
    },
    {
      name: "不透明度付き",
      code: component(`<p className="text-blue-600/80">x</p>`),
    },
    {
      name: "!important 付き",
      code: component(`<p className="!border-emerald-200">x</p>`),
    },
    {
      name: "グラデーション・リング等の長い接頭辞",
      code: component(
        `<p className="from-amber-400 ring-offset-zinc-950">x</p>`
      ),
    },
    {
      name: "slate・yellow・orange・green",
      code: component(
        `<p className="bg-slate-50 text-yellow-800 border-orange-100 text-green-700">x</p>`
      ),
    },
    {
      name: "テンプレートリテラル",
      code: component(
        '<p className={`p-2 ${active ? "font-bold" : ""} text-green-700`}>x</p>'
      ),
    },
    {
      name: "関数に渡す文字列",
      code: `const cn = (...xs: string[]) => xs.join(" ");\nexport const x = cn("p-2", "text-yellow-800");\n`,
    },
    {
      name: "オブジェクトのキー",
      code: `export const x = (active: boolean) => ({ "bg-orange-100": active });\n`,
    },
  ];

  it.each(FILES.flatMap((file) => forbidden.map((c) => ({ ...c, file }))))(
    "$file で $name を書くと失敗する",
    async ({ file, code }) => {
      const result = await designTokenMessages(file, code);
      expect(result.length).toBeGreaterThan(0);
    }
  );

  it("代わりに使うトークンとスキルを案内する", async () => {
    const [message] = await designTokenMessages(
      "src/app/sample-section.tsx",
      component(`<p className="text-gray-500">x</p>`)
    );
    for (const token of [
      "neutral-",
      "danger",
      "success",
      "warning",
      "primary-",
      SKILL,
    ]) {
      expect(message.message).toContain(token);
    }
  });

  it.each([
    {
      name: "neutral のトークン",
      jsx: `<p className="text-neutral-500 bg-neutral-50">x</p>`,
    },
    {
      name: "意味の色のトークン",
      jsx: `<p className="text-danger bg-success/10 border-warning text-info">x</p>`,
    },
    {
      name: "ゴールドのトークン",
      jsx: `<p className="bg-primary text-primary-strong from-primary-light">x</p>`,
    },
    {
      name: "ブランドのテーマのトークン",
      jsx: `<p className="text-brand-primary">x</p>`,
    },
    { name: "白・黒", jsx: `<p className="bg-white text-black">x</p>` },
  ])("$name は通る", async ({ jsx }) => {
    const result = await designTokenMessages(
      "src/app/sample-section.tsx",
      component(jsx)
    );
    expect(result).toEqual([]);
  });
});

describe("色の値の直書き", () => {
  const forbidden = [
    {
      name: "任意の値の背景色",
      code: component(`<p className="bg-[#a9791d]">x</p>`),
    },
    {
      name: "任意の値の文字色（大文字・不透明度付き）",
      code: component(`<p className="text-[#A9791Dcc]">x</p>`),
    },
    {
      name: "グラデーション",
      code: component(
        `<p className="bg-[linear-gradient(160deg,#e8c766,#a9791d)]">x</p>`
      ),
    },
    {
      name: "style の色",
      code: component(`<p style={{ color: "#fff" }}>x</p>`),
    },
    {
      name: "style のグラデーション（空白区切り）",
      code: component(
        `<p style={{ background: "linear-gradient(160deg, #e8c766, #a9791d)" }}>x</p>`
      ),
    },
    {
      name: "テンプレートリテラル",
      code: component(
        '<p className={`p-2 ${active ? "" : ""} bg-[#a9791d]`}>x</p>'
      ),
    },
  ];

  it.each(FILES.flatMap((file) => forbidden.map((c) => ({ ...c, file }))))(
    "$file で $name を書くと失敗する",
    async ({ file, code }) => {
      const result = await designTokenMessages(file, code);
      expect(result.length).toBeGreaterThan(0);
    }
  );

  it.each([
    {
      name: "ページ内リンク",
      jsx: `<a href="#add">x</a>`,
    },
    {
      name: "文中の issue 番号",
      jsx: `<p title="カードの更新（#216）">x</p>`,
    },
    {
      name: "実行時に決まる色（ブランドのテーマ）",
      jsx: `<p style={{ "--brand-primary": theme.primaryColorHex } as React.CSSProperties}>x</p>`,
    },
  ])("$name は通る", async ({ jsx }) => {
    const result = await designTokenMessages(
      "src/app/sample-section.tsx",
      component(jsx)
    );
    expect(result).toEqual([]);
  });
});

describe("対象の範囲", () => {
  const code = component(`<p className="text-gray-500 bg-[#a9791d]">x</p>`);

  it.each([
    "src/components/ui/sample.tsx",
    "src/components/ui/sample.stories.tsx",
    "src/components/sample.stories.tsx",
    "src/app/sample.stories.tsx",
  ])("%s は対象にしない", async (file) => {
    expect(await designTokenMessages(file, code)).toEqual([]);
  });

  it("ほかの no-restricted-syntax（catch・テーブルの指定）と併せて効く（設定が置き換わらない）", async () => {
    const [result] = await eslint.lintText(
      `export async function run(db: { from(t: string): unknown }, f: () => Promise<void>) {\n  try {\n    await f();\n  } catch {\n    return db.from("users");\n  }\n  return "text-gray-500";\n}\n`,
      { filePath: "src/app/sample-section.tsx" }
    );
    const messages = result.messages
      .filter((m) => m.ruleId === RULE)
      .map((m) => m.message);
    expect(messages.some((m) => m.includes(SKILL))).toBe(true);
    expect(messages.some((m) => m.includes("sentry.md"))).toBe(true);
    expect(messages.some((m) => m.includes('.from("...")'))).toBe(true);
  });
});

// 空の it.each は vitest がエラーにするため、一覧が空になったら飛ばす
describe.skipIf(DESIGN_TOKEN_LEGACY_FILES.length === 0)(
  "今残っているファイルの一覧",
  () => {
    it.each(DESIGN_TOKEN_LEGACY_FILES)("%s は存在する", (file) => {
      expect(existsSync(file)).toBe(true);
    });

    // [id] 等の動的ルートのファイルも外れていること
    it.each(DESIGN_TOKEN_LEGACY_FILES)("%s は対象にしない", async (file) => {
      expect(
        await designTokenMessages(file, readFileSync(file, "utf8"))
      ).toEqual([]);
    });

    // 作り直して0件になったファイルは一覧から消す（一覧に残ると、そのファイルで書き戻しても気付けない）
    it.each(DESIGN_TOKEN_LEGACY_FILES)(
      "%s にはまだ対象の書き方が残っている",
      async (file) => {
        const renamed = join(
          dirname(file),
          `${basename(file, extname(file))}.__legacy-check__${extname(file)}`
        );
        const result = await designTokenMessages(
          renamed,
          readFileSync(file, "utf8")
        );
        expect(result.length).toBeGreaterThan(0);
      }
    );
  }
);
