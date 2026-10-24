import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const DOC = "docs/ai-prompts/architecture.md";

function read(file: string) {
  return readFileSync(path.resolve(ROOT, file), "utf8");
}

// 見出し（`## ...`）から次の同じ階層の見出しまでを切り出す
function section(body: string, heading: string) {
  const start = body.indexOf(`\n## ${heading}`);
  expect(start, `「## ${heading}」が見つからない`).toBeGreaterThanOrEqual(0);
  const rest = body.slice(start + 1);
  const end = rest.slice(1).search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

// 各キーワードが、前のキーワードより後ろにこの順で書かれているか
function expectInOrder(text: string, keywords: string[]) {
  let from = 0;
  for (const k of keywords) {
    const i = text.indexOf(k, from);
    expect(i, `「${k}」がこの順で書かれていない`).toBeGreaterThanOrEqual(0);
    from = i + k.length;
  }
}

// 層の責務と依存のルール（#438）。後続のlint（#439〜#442）のエラーメッセージから参照する「正」
describe(`${DOC}（層の責務と依存のルール）`, () => {
  it("ファイルがある", () => {
    expect(existsSync(path.resolve(ROOT, DOC))).toBe(true);
  });

  it.each([
    "src/domain",
    "src/repositories",
    "src/use-cases",
    "src/queries",
    "src/infrastructure",
    "src/composition",
    "src/app",
    "src/components",
    "src/lib",
    "src/emails",
  ])("層の一覧に %s の責務がある", (dir) => {
    expect(section(read(DOC), "層の一覧と責務")).toContain(`\`${dir}/\``);
  });

  it("依存してよい方向が許可リストの形で書かれている", () => {
    const deps = section(read(DOC), "依存してよい方向");
    expect(deps).toMatch(/許可リスト/);
    expect(deps).toMatch(/domain.*何にも依存しない/);
  });

  it("書き込みは use-case、読み取りは Query Service を通す（CQRS）", () => {
    const cqrs = section(read(DOC), "書き込みと読み取り（CQRS）");
    expect(cqrs).toMatch(/書き込みは use-case を必ず通す/);
    expect(cqrs).toMatch(/読み取りは Query Service を通す/);
    expect(cqrs).toMatch(/app から DB・外部SDKを直接触らない/);
  });

  it("Query Service の interface・実装・戻り値・業務ルールの適用場所が書かれている", () => {
    const qs = section(read(DOC), "Query Service");
    expect(qs).toContain("`src/queries/`");
    expect(qs).toContain("`src/infrastructure/`");
    expect(qs).toMatch(/DTO/);
    expect(qs).toContain("MemberRank");
  });

  it("組み立ては src/composition に置き、app は composition が返すものだけを使う", () => {
    const comp = section(read(DOC), "組み立て（composition）");
    expect(comp).toContain("`src/composition/`");
    expect(comp).toMatch(
      /app は composition が返す use-case・Query Service だけを使う/
    );
  });

  it("外部サービスのクライアント生成は infrastructure に置く", () => {
    const clients = section(read(DOC), "外部サービスのクライアント");
    for (const s of ["Supabase", "Sanity", "Stripe", "Resend"]) {
      expect(clients).toContain(s);
    }
    expect(clients).toContain("`src/infrastructure/`");
  });

  it("src/lib は業務を知らない共通部品だけで、置かないものが列挙されている", () => {
    const lib = section(read(DOC), "src/lib に置くもの・置かないもの");
    expect(lib).toMatch(/業務を知らない/);
    for (const s of ["DBアクセス", "業務ルール", "組み立て", "Server Action"]) {
      expect(lib).toContain(s);
    }
  });

  it("メールテンプレートは src/emails に置く", () => {
    expect(section(read(DOC), "メールテンプレート")).toContain("`src/emails/`");
  });

  it("Sanity Studio と Studio 用ツールは層構成の対象外", () => {
    const studio = section(read(DOC), "層構成の対象外");
    expect(studio).toContain("`src/sanity/`");
    expect(studio).toContain("`src/lib/product-import`");
  });

  it("use-case は薄く、domain は厚く", () => {
    const thin = section(read(DOC), "use-case は薄く、domain は厚く");
    expect(thin).toMatch(/entity・value object・domain service/);
    expect(thin).toMatch(/トランザクション境界/);
    expect(thin).toMatch(/補償処理/);
  });

  it("外側の関心事はポート（interface）経由にする", () => {
    const ports = section(read(DOC), "外側の関心事はポート経由");
    expect(ports).toMatch(/エラー通知/);
    expect(ports).toMatch(/interface/);
  });

  it("置き場所の判断フローが、決められた問いの順番で書かれている", () => {
    expectInOrder(section(read(DOC), "置き場所の判断フロー"), [
      "業務ルールか",
      "操作の手順か",
      "画面用の読み取りか",
      "形式の変換か",
      "組み立てか",
    ]);
  });
});

describe("CLAUDE.md からの参照", () => {
  it("「ライブラリ別実装ガイド」から architecture.md を参照している", () => {
    const body = read("CLAUDE.md");
    const start = body.indexOf("## ライブラリ別実装ガイド");
    expect(start).toBeGreaterThanOrEqual(0);
    const guide = body.slice(start, body.indexOf("\n## ", start + 1));
    expect(guide).toContain(`\`${DOC}\``);
  });

  it("「変更した層ごとの確認ルール」に src/queries と src/composition の確認方法がある", () => {
    const body = read("CLAUDE.md");
    const start = body.indexOf("**変更した層ごとの確認ルール**");
    expect(start).toBeGreaterThanOrEqual(0);
    const table = body.slice(start, body.indexOf("\n\n**", start + 1));
    expect(table).toContain("`src/queries/*`");
    expect(table).toContain("`src/composition/*`");
  });
});
