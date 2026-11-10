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
  // app・middleware は composition が返す use-case（書き込み）・Query Service（読み取り）だけを使う（#441）。
  // 禁止リスト（repositories・infrastructure だけ）では use-cases の直接 import を止められないため許可リストにする
  {
    layer: "app",
    allow: ["composition", "domain", "queries", "lib", "components"],
    external: true,
    hint: "書き込みは use-case、読み取りは Query Service を、@/composition が返すものだけ使う。use-case・repository・infrastructure を直接 import しない（import type も含む）。",
  },
  {
    layer: "middleware",
    file: "src/middleware.ts",
    allow: ["composition", "domain", "queries", "lib"],
    external: true,
    hint: "読み取りは Query Service を、@/composition が返すものだけ使う。use-case・repository・infrastructure を直接 import しない（import type も含む）。",
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

// DB・外部サービスのクライアントは src/infrastructure/ の中だけで使う（#440）。repository を通さない直接クエリが、
// 業務ルールのコピーと食い違いを生んだ（#444）。domain・repositories・queries・use-cases は、層の許可リストで
// 外部SDKをすでに禁止しているので、それ以外の src/ に足す。既存の違反は eslint-suppressions.json に記録している
const CLIENT_DOC =
  "DB・外部サービスは repository（書き込み・その判断に要る読み取り）か Query Service（画面用の読み取り）を composition 経由で使い、実装は src/infrastructure/ に置く。docs/ai-prompts/architecture.md の「外部サービスのクライアント」を参照（#440）";

const clientPatterns = [
  {
    // group（gitignore 形式）の stripe/* は @/infrastructure/stripe/... にも当たるため、先頭に固定した正規表現で書く
    regex: "^(@supabase/|(next-sanity|@sanity/client|stripe|resend)(/|$))",
    message: `@supabase/*・next-sanity・@sanity/client・stripe・resend は src/infrastructure/ の外で import しない。${CLIENT_DOC}`,
  },
];

const clientSyntaxRule = [
  "error",
  {
    // Supabase のテーブル指定（db.from("users")）。Array.from("...")・Buffer.from("...") は除く
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='from'][arguments.0.type=/^(Literal|TemplateLiteral)$/]:not([callee.object.name=/^(Array|Buffer)$/])",
    message: `テーブルを指定するクエリ（.from("...")）は src/infrastructure/ の外で書かない。${CLIENT_DOC}`,
  },
];

// app から使われる側の components・lib（#441）。repository・infrastructure を使うと page に読み取りが戻り、
// app を使うと依存が循環する。表の許可リストより緩い、禁止リストの形で入れている
const APP_SIDE_DOC =
  "docs/ai-prompts/architecture.md の「依存してよい方向」を参照（#441）";

const appSidePatterns = [
  {
    group: [
      "@/repositories",
      "@/repositories/**",
      "@/infrastructure",
      "@/infrastructure/**",
    ],
    message: `src/components/・src/lib/ から @/repositories・@/infrastructure は import しない（import type も含む。型は domain の型か queries の DTO を使う）。DB・外部サービスのデータは app で composition が返す Query Service から取り、props で渡す。${APP_SIDE_DOC}`,
  },
  {
    group: ["@/app", "@/app/**"],
    message: `src/components/・src/lib/ は app から使われる側なので @/app を import しない。Server Action は app から props で受け取る。${APP_SIDE_DOC}`,
  },
];

// 層の許可リストの対象のファイル。middleware は1ファイル
const layerFile = ({ layer, file }) => file ?? `src/${layer}/**`;

function layerImportsConfig({ layer, file, allow, external, hint }) {
  // 同じ層の中は常に許可する（1ファイルの middleware には同じ層が無い）
  const allowed = file ? allow : [layer, ...allow];
  const scope = file ?? `src/${layer}/`;
  const allowedText = [
    ...allowed.map((name) => `@/${name}`),
    ...(external ? ["外部SDK"] : []),
  ].join("・");
  const message = `${scope} から import してよいのは ${allowedText} だけ。${hint}${ARCHITECTURE_DOC}`;
  return {
    files: [file ?? `src/${layer}/**/*.{ts,tsx}`],
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
            file
              ? {
                  group: ["./*", "../*"],
                  message: `相対 import で層の外に出られるため、相対 import は使わず @/composition/... のように書く。${message}`,
                }
              : {
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
            // 外部SDKを許す層のうち、DB・外部サービスのクライアントを使ってよいのは infrastructure だけ（#440）
            ...(external && layer !== "infrastructure" ? clientPatterns : []),
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
    ignores: [
      ...LAYER_IMPORTS.map(layerFile),
      "src/components/**",
      "src/lib/**",
      "src/sanity/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...domainConstantPatterns, ...clientPatterns] },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...domainConstantPatterns,
            ...clientPatterns,
            ...appSidePatterns,
          ],
        },
      ],
    },
  },
  // Sanity Studio は Sanity のクライアントを直接使う（#440 の対象外）
  {
    files: ["src/sanity/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: domainConstantPatterns }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/infrastructure/**", "src/sanity/**"],
    rules: {
      "no-restricted-syntax": clientSyntaxRule,
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
