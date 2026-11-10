// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 層の依存方向（#439）。docs/ai-prompts/architecture.md の「依存してよい方向」の表と同じ内容を、
// import してよいものだけを並べる許可リストで書く（表との一致は tests/unit/lint/layer-imports.test.ts が確かめる）。
// 同じ層の中は常に許可する。flat config では同じルールを指定したブロックが後勝ちで置き換わるため、層ごとのブロックは重ねない
const ARCHITECTURE_DOC =
  "docs/ai-prompts/architecture.md の「依存してよい方向」を参照（#439）";

const LAYER_IMPORTS = [
  {
    layer: "domain",
    allow: [],
    external: false,
    hint: "業務ルールは何にも依存させない。DB・外部サービスの操作が要るなら src/repositories/ に interface を置き、use-case から呼ぶ。",
  },
  {
    layer: "repositories",
    allow: ["domain"],
    external: false,
    hint: "ポート（interface）と domain の型だけで書き、実装は src/infrastructure/ に置く。",
  },
  {
    layer: "queries",
    allow: ["domain"],
    external: false,
    hint: "Query Service の interface と DTO の型だけで書き、実装は src/infrastructure/ に置く。",
  },
  {
    layer: "use-cases",
    allow: ["domain", "repositories"],
    external: false,
    hint: "DB・外部SDK・エラー通知などは src/repositories/ の interface 経由で使い、実装は src/composition/ で注入する。書き込みの判断に要るデータは Query Service ではなく repository から取る。",
  },
  {
    layer: "infrastructure",
    allow: ["domain", "repositories", "queries", "lib", "emails", "types"],
    external: true,
    hint: "手順は src/use-cases/ に、組み立ては src/composition/ に置き、infrastructure からは呼ばない。",
  },
];

// domain の内部の定数（#442）。ルールの正になっている定数を domain の外で使うと、ルールのコピーが生まれる
// （実例: RANK_ORDER でランクの判定を再実装していた #445）。domain の外からは値オブジェクトのメソッドを使う。
// src/domain/ で export している定数がすべて並んでいることは tests/unit/lint/layer-imports.test.ts が確かめる
const DOMAIN_CONSTANT_DOC =
  "docs/ai-prompts/architecture.md の「依存してよい方向」を参照（#442）";

const DOMAIN_CONSTANTS = [
  {
    module: "domain/value-objects/member-rank",
    names: ["RANK_ORDER"],
    use: "ランクの比較・一覧は MemberRank.of()・canAccess()・accessibleRanks()・isHigherThan()・selfServiceRanks() を使う。",
  },
  {
    module: "domain/value-objects/approval-status",
    names: ["APPROVAL_STATUS_VALUES"],
    use: "値の検証・判定は ApprovalStatus.of()・isPending()・isDecided() を使う。",
  },
  {
    module: "domain/value-objects/member-type",
    names: ["MEMBER_TYPES"],
    use: "値の検証・判定は MemberType.of()・isCorporate() を使う。",
  },
  {
    module: "domain/value-objects/order-status",
    names: ["ORDER_STATUS_VALUES"],
    use: "値の検証・判定は OrderStatus.of()・isTerminal()・isCancellable() を使う。",
  },
];

// no-restricted-imports の patterns に足す。flat config では同じルールのブロックが後勝ちで置き換わるため、
// 層ごとのブロックにも、それ以外の src/ のブロックにも同じものを入れる
const domainConstantPatterns = DOMAIN_CONSTANTS.map(
  ({ module, names, use }) => ({
    // @/domain/... と相対パス（../../domain/...）の両方
    group: [`**/${module}`],
    importNames: names,
    message: `${names.join("・")} は domain の内部の定数なので、domain の外で使わない。${use}${DOMAIN_CONSTANT_DOC}`,
  })
);

function layerImportsConfig({ layer, allow, external, hint }) {
  const allowed = [layer, ...allow];
  const allowedText = [
    ...allowed.map((name) => `@/${name}`),
    ...(external ? ["外部SDK"] : []),
  ].join("・");
  const message = `src/${layer}/ から import してよいのは ${allowedText} だけ。${hint}${ARCHITECTURE_DOC}`;
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/**",
                ...allowed.flatMap((name) => [`!@/${name}`, `!@/${name}/**`]),
              ],
              message,
            },
            {
              group: ["../*"],
              message: `../ で層の外に出られるため、親ディレクトリへの相対 import は使わず @/${layer}/... のように書く。${message}`,
            },
            ...(external
              ? []
              : [
                  {
                    // @/ と相対パス以外（外部パッケージ・node: 等）
                    regex: "^(?!@/|\\.)",
                    message: `src/${layer}/ では外部SDK（@supabase/*・stripe・@clerk/*・@sentry/*・next/*・react 等）を import しない。${message}`,
                  },
                ]),
            ...(layer === "domain" ? [] : domainConstantPatterns),
          ],
        },
      ],
    },
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare opennext build output:
    ".open-next/**",
    // Sanity Studio build output:
    "dist/**",
    // Sanity CLI runtime:
    ".sanity/**",
    // Playwright実行時の生成物:
    "playwright-report/**",
    "test-results/**",
    // Vitestのカバレッジ出力:
    "coverage/**",
    // Storybook build output:
    "storybook-static/**",
    // Wranglerのローカル状態・ビルド成果物:
    ".wrangler/**",
    // Vercel CLIのローカル設定:
    ".vercel/**",
    // npx skills add で導入したベンダー製スキル（自プロジェクトのコード規約対象外）:
    ".agents/**",
    ".claude/skills/**",
    // Claude Codeが作るワークツリー（各ワークツリーのsrc/・.next/等を丸ごと含む）:
    ".claude/worktrees/**",
  ]),
  ...storybook.configs["flat/recommended"],
  ...LAYER_IMPORTS.map(layerImportsConfig),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: LAYER_IMPORTS.map(({ layer }) => `src/${layer}/**`),
    rules: {
      "no-restricted-imports": ["error", { patterns: domainConstantPatterns }],
    },
  },
  // E2Eでnetworkidleを待たない（#519）。Next.jsのprefetch・Clerkのトークン更新等で
  // 通信が途切れず、上限なしで待ち続けてテストのタイムアウトになることがある。
  // 次に操作する要素の表示（toBeVisible）や遷移（toHaveURL）を待つ
  {
    files: ["tests/e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='waitForLoadState'][arguments.0.value='networkidle']",
          message:
            "networkidleは待たない。次に操作する要素をexpect(...).toBeVisible()で、遷移をtoHaveURLで待つ（#519）",
        },
        {
          selector: "Property[key.name='waitUntil'][value.value='networkidle']",
          message:
            "networkidleは待たない。次に操作する要素をexpect(...).toBeVisible()で、遷移をtoHaveURLで待つ（#519）",
        },
      ],
    },
  },
]);

export default eslintConfig;
