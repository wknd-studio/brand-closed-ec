import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * 本番（prod）・stg の環境の設定がそろっているかを確かめる（#698）。
 *
 * Doppler の Worker 用の config（`stg`・`prod`）とデプロイ用の config（`stg_deploy`・`prod_deploy`）を読み、
 * 名前が stg とそろっているか・本番の値が stg と違うか・キーが live か、と、Stripe・Clerk・Supabase の
 * 設定を各サービスの API で読んで確かめる。項目ごとに OK / NG / SKIP と直し方を出す。値は画面に出さない。
 *
 * API は読み取りだけを行う。例外は Clerk の `POST /v1/webhooks/svix_url` で、Webhook の送り先を持つ Svix の
 * ダッシュボードに入るための一時的なトークンを発行するだけで、設定は変えない（Clerk の Backend API には
 * Webhook の送り先を読む API が無いため）。
 *
 * `prod` を読むには Doppler の `prod` の読み取り権限が要るため、CI では流さず、人間が手元で
 * `task env:check -- <stg|prod>` で動かす（docs/runbooks/prod-env-checklist.md）。Supabase の third-party auth は
 * 個人用のトークン（`SUPABASE_ACCESS_TOKEN`）が要り、Doppler には置かない（docs/cicd.md）ため、渡されて
 * いなければ SKIP にする。
 */

export type CheckResult = {
  name: string;
  status: "ok" | "ng" | "skip";
  detail?: string;
  fix?: string;
};

export type Target = {
  env: "stg" | "prod";
  production: boolean;
  config: string;
  deployConfig: string;
};

const DOPPLER_PROJECT = "brand-closed-ec";

/** stg にだけ置き、本番には置かない名前と理由（Worker 用の config） */
export const STG_ONLY_NAMES: Record<string, string> = {
  RESEND_TEST_TO:
    "会員・運営者へのメールの宛先をすべてこのアドレスに差し替えるため、本番に置くとお客様にメールが届かない",
};

/** stg にだけ置く名前と理由（デプロイ用の config） */
export const STG_DEPLOY_ONLY_NAMES: Record<string, string> = {
  ...STG_ONLY_NAMES,
  E2E_USER_EMAIL: "E2E Tests (stg) だけが使う",
  E2E_USER_PASSWORD: "E2E Tests (stg) だけが使う",
  SEED_USER_PASSWORD: "stg のシードだけが使う",
  SANITY_AUTH_TOKEN: "Sanity Studio のデプロイは Deploy (staging) だけで行う",
};

/** stg では空でよい名前と理由 */
export const STG_EMPTY_OK_NAMES: Record<string, string> = {
  RESEND_ADMIN_EMAIL:
    "stg は RESEND_TEST_TO があり、運営者宛てのメールもそちらに送るため使わない",
};

/** 本番にだけ置く名前と理由 */
export const PROD_ONLY_NAMES: Record<string, string> = {};

/** 本番で stg と同じ値であってはいけない名前 */
export const MUST_DIFFER_NAMES = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_WEBHOOK_SECRET",
  "CLERK_ADMIN_ORGANIZATION_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_PROJECT_REF",
  "SENTRY_AUTH_TOKEN",
  "RESEND_API_KEY",
  "SANITY_API_TOKEN",
  "SANITY_WRITE_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "NEXT_PUBLIC_APP_URL",
];

/** 環境ごとに決まっている値（requirements.md の 13-2）。違ったときに実際の値を出すため、秘密でない値（`NEXT_PUBLIC_*`）だけを置く */
export const EXPECTED_VALUES: Record<Target["env"], Record<string, string>> = {
  stg: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: "stg",
    NEXT_PUBLIC_SANITY_DATASET: "staging",
  },
  prod: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: "prod",
    NEXT_PUBLIC_SANITY_DATASET: "production",
  },
};

export function parseTarget(args: string[]): Target {
  const env = args[0];
  if (env !== "stg" && env !== "prod") {
    throw new Error(
      "対象の環境を stg か prod で指定する（例: task env:check -- prod）"
    );
  }
  return {
    env,
    production: env === "prod",
    config: env,
    deployConfig: `${env}_deploy`,
  };
}

function ok(name: string): CheckResult[] {
  return [{ name, status: "ok" }];
}

function ng(name: string, problems: string[], fix: string): CheckResult[] {
  return [{ name, status: "ng", detail: problems.join(" / "), fix }];
}

export function checkNames(input: {
  label: string;
  target: string[];
  reference: string[];
  referenceOnly: Record<string, string>;
  targetOnly: Record<string, string>;
}): CheckResult[] {
  const target = new Set(input.target);
  const reference = new Set(input.reference);
  const missing = [...reference]
    .filter((n) => !target.has(n) && !(n in input.referenceOnly))
    .sort();
  const extra = [...target]
    .filter(
      (n) =>
        !reference.has(n) &&
        !(n in input.targetOnly) &&
        !(n in input.referenceOnly)
    )
    .sort();
  const leaked =
    input.label === "stg" || input.label === "stg_deploy"
      ? []
      : [...target].filter((n) => n in input.referenceOnly).sort();
  const problems = [
    ...(missing.length ? [`足りない: ${missing.join(", ")}`] : []),
    ...(extra.length ? [`stg に無い: ${extra.join(", ")}`] : []),
    ...(leaked.length
      ? [`stg だけのはずの名前がある: ${leaked.join(", ")}`]
      : []),
  ];
  const name = `${input.label}: 名前`;
  if (problems.length === 0) return ok(name);
  return ng(
    name,
    problems,
    `足りないものは Doppler の ${input.label} に入れる。stg に無いもの・stg だけのはずのものは、使われていなければ消す（必要なら scripts/check-env.ts の許可リストに理由と一緒に足す）`
  );
}

export function checkValuesDiffer(
  target: Record<string, string>,
  reference: Record<string, string>,
  names: string[],
  label?: string
): CheckResult[] {
  const same = names.filter(
    (n) => n in target && n in reference && target[n] === reference[n]
  );
  const name = label ? `${label}: 値が stg と違う` : "値が stg と違う";
  if (same.length === 0) return ok(name);
  return ng(
    name,
    [`stg と同じ値: ${same.join(", ")}`],
    "本番のサービスで発行したキー・本番の URL に入れ替える"
  );
}

const LIVE_KEY_PREFIXES: Record<string, string[]> = {
  STRIPE_SECRET_KEY: ["sk_live_", "rk_live_"],
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ["pk_live_"],
  CLERK_SECRET_KEY: ["sk_live_"],
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ["pk_live_"],
};

/** 値の先頭の種類（`sk_test_` 等）だけを返す。値そのものは出さない */
function keyKind(value: string | undefined): string {
  if (!value) return "未設定";
  return /^(?:sk|pk|rk)_(?:test|live)_/.exec(value)?.[0] ?? "不明な形式";
}

export function checkLiveKeys(values: Record<string, string>): CheckResult[] {
  const wrong = Object.entries(LIVE_KEY_PREFIXES)
    .filter(([n, prefixes]) => !prefixes.some((p) => values[n]?.startsWith(p)))
    .map(([n]) => `${n}（${keyKind(values[n])}）`);
  const name = "live のキー";
  if (wrong.length === 0) return ok(name);
  return ng(
    name,
    wrong,
    "Stripe は本番モード、Clerk は Production インスタンスのキーに入れ替える"
  );
}

export function checkExpectedValues(
  values: Record<string, string>,
  expected: Record<string, string>
): CheckResult[] {
  const wrong = Object.entries(expected)
    .filter(([n, v]) => values[n] !== v)
    .map(([n, v]) => `${n} が ${values[n] ?? "未設定"}（期待: ${v}）`);
  const name = "決まった値";
  if (wrong.length === 0) return ok(name);
  return ng(name, wrong, "期待の値に直す（requirements.md の 13-2）");
}

export function checkEmptyValues(
  label: string,
  values: Record<string, string>,
  emptyOk: Record<string, string> = {}
): CheckResult[] {
  const empty = Object.keys(values)
    .filter((n) => values[n] === "" && !(n in emptyOk))
    .sort();
  const name = `${label}: 値が空`;
  if (empty.length === 0) return ok(name);
  return ng(name, [empty.join(", ")], `Doppler の ${label} に値を入れる`);
}

function isUrl(value: string | undefined): boolean {
  try {
    new URL(value ?? "");
    return true;
  } catch {
    return false;
  }
}

/** API を読む前に、要る値がそろっているか。そろっていなければ、その区分の NG を返す（値は出さない） */
export function requireValues(
  section: string,
  values: Record<string, string>,
  names: string[]
): CheckResult[] | null {
  const problems = names.flatMap((n) => {
    if (!values[n]) return [`${n} が空`];
    if (n.endsWith("_URL") && !isUrl(values[n])) return [`${n} が URL でない`];
    return [];
  });
  if (problems.length === 0) return null;
  return ng(
    section,
    problems,
    "Doppler に値を入れてから流し直す（それまでこの区分の API は読まない）"
  );
}

/** Webhook のルートが分岐する `event.type === "..."` を集める。必要なイベントの正はルートの実装 */
export function handledEventTypes(source: string): string[] {
  const types = new Set<string>();
  for (const m of source.matchAll(/event\.type\s*===\s*"([^"]+)"/g)) {
    types.add(m[1]);
  }
  return [...types].sort();
}

export type StripeWebhookEndpoint = {
  url: string;
  status: string;
  enabled_events: string[];
};

export function checkStripeWebhook(
  endpoints: StripeWebhookEndpoint[],
  appUrl: string,
  events: string[]
): CheckResult[] {
  const url = new URL("/api/webhooks/stripe", appUrl).href;
  const name = "Stripe: Webhook";
  const fix = `Stripe のダッシュボードの Webhook に、送り先 ${url}・イベント ${events.join(", ")} の送り先を作り、署名のシークレットを STRIPE_WEBHOOK_SECRET に入れる`;
  const endpoint = endpoints.find((e) => e.url === url);
  if (!endpoint) return ng(name, [`${url} に向いた送り先が無い`], fix);
  if (endpoint.status !== "enabled") {
    return ng(name, [`${url} の送り先が ${endpoint.status}`], fix);
  }
  const missing = endpoint.enabled_events.includes("*")
    ? []
    : events.filter((e) => !endpoint.enabled_events.includes(e));
  if (missing.length > 0) {
    return ng(name, [`受け取らないイベント: ${missing.join(", ")}`], fix);
  }
  return ok(name);
}

export type StripePrice = { active: boolean; livemode: boolean; type: string };

export function checkStripePrices(
  prices: { name: string; price: StripePrice | null }[],
  livemode: boolean
): CheckResult[] {
  const name = "Stripe: Price";
  const fix =
    "scripts/setup-stripe-prices.ts で本番の Price を作り、出力された ID を Doppler の STRIPE_PRICE_ID_* に入れる";
  if (prices.length === 0) return ng(name, ["STRIPE_PRICE_ID_* が無い"], fix);
  const problems: string[] = [];
  for (const { name: n, price } of prices) {
    const type = n.endsWith("_INITIAL_FEE") ? "one_time" : "recurring";
    if (!price) problems.push(`${n}: 無い`);
    else if (!price.active) problems.push(`${n}: 無効`);
    else if (price.livemode !== livemode) {
      problems.push(`${n}: ${price.livemode ? "本番モード" : "テストモード"}`);
    } else if (price.type !== type) {
      problems.push(`${n}: 種類が ${price.type}（期待: ${type}）`);
    }
  }
  if (problems.length === 0) return ok(name);
  return ng(name, problems, fix);
}

/** publishable key（`pk_<mode>_<base64("<host>$")>`）から Frontend API のホストを取り出す */
export function clerkFrontendApiHost(publishableKey: string): string | null {
  const encoded = /^pk_(?:test|live)_(.+)$/.exec(publishableKey)?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return decoded.endsWith("$") ? decoded.slice(0, -1) : null;
}

export type ClerkDomain = { name: string; frontend_api_url: string };

export function checkClerkInstance(input: {
  environmentType: string;
  domains: ClerkDomain[];
  publishableKey: string;
  appUrl: string;
  production: boolean;
}): CheckResult[] {
  const name = "Clerk: インスタンス";
  const problems: string[] = [];
  if (input.production && input.environmentType !== "production") {
    problems.push(
      `CLERK_SECRET_KEY のインスタンスが ${input.environmentType}（期待: production）`
    );
  }
  const keyHost = clerkFrontendApiHost(input.publishableKey);
  const domain = input.domains.find(
    (d) => new URL(d.frontend_api_url).host === keyHost
  );
  if (!domain) {
    problems.push(
      `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY の Frontend API（${keyHost ?? "読めない"}）が CLERK_SECRET_KEY のインスタンスのドメイン（${input.domains.map((d) => new URL(d.frontend_api_url).host).join(", ")}）に無い`
    );
  }
  // キーとドメインが食い違っていても、アプリの URL はインスタンスの主のドメインと比べる
  const primary = domain ?? input.domains[0];
  if (input.production && !isUrl(input.appUrl)) {
    problems.push("NEXT_PUBLIC_APP_URL が URL でない");
  }
  const appHost = isUrl(input.appUrl) ? new URL(input.appUrl).host : null;
  if (
    input.production &&
    primary &&
    appHost !== null &&
    appHost !== primary.name &&
    !appHost.endsWith(`.${primary.name}`)
  ) {
    problems.push(
      `NEXT_PUBLIC_APP_URL（${appHost}）が Clerk のドメイン（${primary.name}）の下に無い`
    );
  }
  if (problems.length === 0) return ok(name);
  return ng(
    name,
    problems,
    "Clerk の Production インスタンスにアプリのドメインを設定し、そのインスタンスの publishable key・secret key を Doppler に入れる"
  );
}

export type SvixEndpoint = {
  url: string;
  disabled?: boolean;
  filterTypes?: string[] | null;
};

export function checkClerkWebhook(
  endpoints: SvixEndpoint[],
  appUrl: string,
  events: string[]
): CheckResult[] {
  const url = new URL("/api/webhooks/clerk", appUrl).href;
  const name = "Clerk: Webhook";
  const fix = `Clerk のダッシュボードの Webhooks に、送り先 ${url}・イベント ${events.join(", ")} の送り先を作り、Signing Secret を CLERK_WEBHOOK_SECRET に入れる`;
  const endpoint = endpoints.find((e) => e.url === url);
  if (!endpoint) return ng(name, [`${url} に向いた送り先が無い`], fix);
  if (endpoint.disabled) return ng(name, [`${url} の送り先が無効`], fix);
  const filter = endpoint.filterTypes ?? [];
  const missing =
    filter.length === 0 ? [] : events.filter((e) => !filter.includes(e));
  if (missing.length > 0) {
    return ng(name, [`受け取らないイベント: ${missing.join(", ")}`], fix);
  }
  return ok(name);
}

export type ThirdPartyAuth = { type?: string; oidc_issuer_url?: string | null };

export function checkSupabaseThirdPartyAuth(
  integrations: ThirdPartyAuth[] | null,
  clerkHost: string | null
): CheckResult[] {
  const name = "Supabase: third-party auth（Clerk）";
  if (integrations === null) {
    return [
      {
        name,
        status: "skip",
        detail: "Supabase の管理用のトークンが無く、読めない",
        fix: "Supabase の個人用トークンを SUPABASE_ACCESS_TOKEN に入れて流し直す（例: SUPABASE_ACCESS_TOKEN=$(pbpaste) task env:check -- prod）。Doppler には置かない",
      },
    ];
  }
  const issuers = integrations
    .map((i) => (i.oidc_issuer_url ? new URL(i.oidc_issuer_url).host : null))
    .filter((h): h is string => h !== null);
  if (clerkHost && issuers.includes(clerkHost)) return ok(name);
  return ng(
    name,
    [
      `Clerk の Frontend API（${clerkHost ?? "読めない"}）が登録されていない（登録済み: ${issuers.join(", ") || "なし"}）`,
    ],
    "Supabase のダッシュボードの Authentication → Sign In / Providers → Third Party Auth に、Clerk の Production インスタンスのドメインを登録する"
  );
}

/**
 * `supabase migration list` の出力から、リモートに適用済みのバージョンを読む。
 * 端末では表を、エージェントから動かすと JSON を出す（`-o` では切り替わらない）ため、両方を読む
 */
export function parseRemoteMigrations(out: string): string[] {
  const json = out.indexOf("{");
  if (json >= 0) {
    const { migrations } = parseJsonWithoutLeak<{
      migrations: { remote: string }[];
    }>(out.slice(json), "supabase migration list の出力");
    return migrations.map((m) => m.remote).filter(Boolean);
  }
  return out
    .split("\n")
    .map((line) => line.split("|")[1]?.replace(/[`\s]/g, "") ?? "")
    .filter((v) => /^\d+$/.test(v));
}

/** 多すぎて読めない一覧は、件数と最初・最後だけにする */
function summarize(items: string[]): string {
  if (items.length <= 5) return items.join(", ");
  return `${items.length}個（${items[0]} 〜 ${items[items.length - 1]}）`;
}

export function checkMigrations(
  local: string[],
  remote: string[]
): CheckResult[] {
  const remoteSet = new Set(remote);
  const localSet = new Set(local);
  const pending = local.filter((v) => !remoteSet.has(v)).sort();
  const unknown = remote.filter((v) => !localSet.has(v)).sort();
  const name = "Supabase: マイグレーション";
  if (pending.length === 0 && unknown.length === 0) return ok(name);
  return ng(
    name,
    [
      ...(pending.length ? [`未適用: ${summarize(pending)}`] : []),
      ...(unknown.length ? [`リモートにだけある: ${unknown.join(", ")}`] : []),
    ],
    "未適用のものは、対象のブランチ（本番は main）への push の Deploy の Migrate DB で適用する。リモートにだけあるものは、どこから入ったかを調べる"
  );
}

/** 端末での表示幅（全角は2桁） */
function displayWidth(text: string): number {
  let width = 0;
  for (const c of text) {
    width +=
      /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(
        c
      )
        ? 2
        : 1;
  }
  return width;
}

function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

/**
 * 表示幅 `width` に収まるよう折り返す。続きの行は2桁下げる。
 * 名前を途中で切らないよう `, ` の区切りを優先し、それでも収まらないもの（日本語の文）だけ文字で切る
 */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  const limit = () => (lines.length === 0 ? width : width - 2);
  const flush = () => {
    lines.push(line.trimEnd());
    line = "";
  };
  for (const piece of text.split(/(?<=, )/)) {
    if (line && displayWidth(line + piece) > limit()) flush();
    line += line ? piece : piece.trimStart();
    while (displayWidth(line) > limit()) {
      let cut = "";
      for (const c of line) {
        if (displayWidth(cut + c) > limit()) break;
        cut += c;
      }
      const rest = line.slice(cut.length).trimStart();
      line = cut;
      flush();
      line = rest;
    }
  }
  if (line) flush();
  return lines.map((l, k) => (k === 0 ? l : `  ${l}`));
}

/** 結果・項目・内容の表にする。内容は問題（` / ` 区切り）ごとに行を分け、直し方をその下に出す */
export function formatResults(
  results: CheckResult[],
  width = 120
): { text: string; failed: boolean } {
  const label = { ok: "OK", ng: "NG", skip: "SKIP" } as const;
  const statusWidth = 4;
  const nameWidth = Math.max(4, ...results.map((r) => displayWidth(r.name)));
  const indent = statusWidth + 2 + nameWidth + 2;
  const contentWidth = Math.max(20, width - indent);
  const row = (status: string, name: string, content: string) =>
    `${padEnd(status, statusWidth)}  ${padEnd(name, nameWidth)}  ${content}`.trimEnd();

  const lines = [
    row("結果", "項目", "内容"),
    row(
      "-".repeat(statusWidth),
      "-".repeat(nameWidth),
      "-".repeat(contentWidth)
    ),
  ];
  for (const r of results) {
    const content = [
      ...(r.detail ? r.detail.split(" / ") : []),
      ...(r.status !== "ok" && r.fix ? [`→ 直し方: ${r.fix}`] : []),
    ].flatMap((c) => wrap(c, contentWidth));
    lines.push(row(label[r.status], r.name, content[0] ?? ""));
    for (const c of content.slice(1)) lines.push(" ".repeat(indent) + c);
  }

  const ngCount = results.filter((r) => r.status === "ng").length;
  const skipCount = results.filter((r) => r.status === "skip").length;
  lines.push(
    "",
    ngCount + skipCount === 0
      ? `全 ${results.length} 項目 OK`
      : `NG ${ngCount}件・SKIP ${skipCount}件（全 ${results.length} 項目）`
  );
  return { text: lines.join("\n"), failed: ngCount > 0 };
}

/** JSON を読む。失敗のメッセージには入力の断片が入るため、決まったメッセージに置き換える（値・トークンを出さない） */
export function parseJsonWithoutLeak<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} を JSON として読めない`);
  }
}

/* 以下はサービスの API を読む部分。判定は上の関数で行い、ここはユニットテストしない */

function readDoppler(config: string): Record<string, string> {
  const out = execFileSync(
    "doppler",
    [
      "secrets",
      "download",
      "--no-file",
      "--format",
      "json",
      "-p",
      DOPPLER_PROJECT,
      "-c",
      config,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
  return parseJsonWithoutLeak<Record<string, string>>(
    out,
    `Doppler の ${config} の出力`
  );
}

async function getJson<T>(
  url: string,
  init: RequestInit & { label: string }
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init.label} が ${res.status} を返した`);
  return parseJsonWithoutLeak<T>(await res.text(), `${init.label} の応答`);
}

async function stripeChecks(
  values: Record<string, string>,
  target: Target
): Promise<CheckResult[]> {
  const headers = { Authorization: `Bearer ${values.STRIPE_SECRET_KEY}` };
  const events = handledEventTypes(
    readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8")
  );
  const endpoints = await getJson<{ data: StripeWebhookEndpoint[] }>(
    "https://api.stripe.com/v1/webhook_endpoints?limit=100",
    { headers, label: "Stripe の webhook_endpoints" }
  );
  const priceNames = Object.keys(values)
    .filter((n) => n.startsWith("STRIPE_PRICE_ID_"))
    .sort();
  const prices = await Promise.all(
    priceNames.map(async (name) => {
      const res = await fetch(
        `https://api.stripe.com/v1/prices/${encodeURIComponent(values[name])}`,
        { headers }
      );
      if (res.status === 404) return { name, price: null };
      if (!res.ok)
        throw new Error(`Stripe の prices が ${res.status} を返した`);
      return {
        name,
        price: parseJsonWithoutLeak<StripePrice>(
          await res.text(),
          "Stripe の prices の応答"
        ),
      };
    })
  );
  return [
    ...checkStripeWebhook(endpoints.data, values.NEXT_PUBLIC_APP_URL, events),
    ...checkStripePrices(prices, target.production),
  ];
}

/** Clerk の Webhook の送り先は Svix にある。ダッシュボードに入るための一時的なトークンで Svix の API を読む */
async function clerkWebhookEndpoints(
  secretKey: string
): Promise<SvixEndpoint[]> {
  const { svix_url } = await getJson<{ svix_url: string }>(
    "https://api.clerk.com/v1/webhooks/svix_url",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}` },
      label: "Clerk の webhooks/svix_url",
    }
  );
  const key = new URL(svix_url).hash.replace(/^#key=/, "");
  const { appId, oneTimeToken, region } = parseJsonWithoutLeak<{
    appId: string;
    oneTimeToken: string;
    region: string;
  }>(
    Buffer.from(key, "base64url").toString("utf8"),
    "Svix のダッシュボードの URL"
  );
  const svix = `https://api.${region}.svix.com/api/v1`;
  const { token } = await getJson<{ token: string }>(
    `${svix}/auth/one-time-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oneTimeToken }),
      label: "Svix の auth/one-time-token",
    }
  );
  const { data } = await getJson<{ data: SvixEndpoint[] }>(
    `${svix}/app/${appId}/endpoint/?limit=250`,
    { headers: { Authorization: `Bearer ${token}` }, label: "Svix の endpoint" }
  );
  return data;
}

async function clerkInstanceChecks(
  values: Record<string, string>,
  target: Target
): Promise<CheckResult[]> {
  const headers = { Authorization: `Bearer ${values.CLERK_SECRET_KEY}` };
  const instance = await getJson<{ environment_type: string }>(
    "https://api.clerk.com/v1/instance",
    { headers, label: "Clerk の instance" }
  );
  const domains = await getJson<{ data: ClerkDomain[] }>(
    "https://api.clerk.com/v1/domains",
    { headers, label: "Clerk の domains" }
  );
  return checkClerkInstance({
    environmentType: instance.environment_type,
    domains: domains.data,
    publishableKey: values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    appUrl: values.NEXT_PUBLIC_APP_URL,
    production: target.production,
  });
}

async function clerkWebhookChecks(
  values: Record<string, string>
): Promise<CheckResult[]> {
  const events = handledEventTypes(
    readFileSync("src/app/api/webhooks/clerk/route.ts", "utf8")
  );
  return checkClerkWebhook(
    await clerkWebhookEndpoints(values.CLERK_SECRET_KEY),
    values.NEXT_PUBLIC_APP_URL,
    events
  );
}

async function supabaseChecks(
  values: Record<string, string>,
  deployValues: Record<string, string>
): Promise<CheckResult[]> {
  const local = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.split("_")[0]);
  let out: string;
  try {
    out = execFileSync(
      "supabase",
      ["migration", "list", "--db-url", deployValues.SUPABASE_DB_URL],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    // 失敗の内容（コマンドライン）に DB のパスワードが入るため、出さずに置き換える
  } catch {
    throw new Error(
      "supabase migration list が失敗した（SUPABASE_DB_URL を確かめる）"
    );
  }
  const remote = parseRemoteMigrations(out);

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const integrations = token
    ? await getJson<ThirdPartyAuth[]>(
        `https://api.supabase.com/v1/projects/${deployValues.SUPABASE_PROJECT_REF}/config/auth/third-party-auth`,
        {
          headers: { Authorization: `Bearer ${token}` },
          label: "Supabase の third-party-auth",
        }
      )
    : null;
  return [
    ...checkMigrations(local, remote),
    ...checkSupabaseThirdPartyAuth(
      integrations,
      clerkFrontendApiHost(values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "")
    ),
  ];
}

/** 要る値が無い・API の取得に失敗したら、その区分を NG にして残りの検査を続ける */
async function guarded(
  name: string,
  required: { values: Record<string, string>; names: string[] },
  run: () => Promise<CheckResult[]>
): Promise<CheckResult[]> {
  const missing = requireValues(name, required.values, required.names);
  if (missing) return missing;
  try {
    return await run();
  } catch (e) {
    return ng(
      name,
      [`取得に失敗: ${e instanceof Error ? e.message : String(e)}`],
      "キー・URL が正しいか、サービスの API に届くかを確かめる"
    );
  }
}

async function main(): Promise<void> {
  const target = parseTarget(process.argv.slice(2));
  const values = readDoppler(target.config);
  const deployValues = readDoppler(target.deployConfig);
  const stg = readDoppler("stg");
  const stgDeploy = readDoppler("stg_deploy");

  const emptyOk = target.production ? {} : STG_EMPTY_OK_NAMES;
  const results: CheckResult[] = [
    ...checkNames({
      label: target.config,
      target: Object.keys(values),
      reference: Object.keys(stg),
      referenceOnly: STG_ONLY_NAMES,
      targetOnly: PROD_ONLY_NAMES,
    }),
    ...checkNames({
      label: target.deployConfig,
      target: Object.keys(deployValues),
      reference: Object.keys(stgDeploy),
      referenceOnly: STG_DEPLOY_ONLY_NAMES,
      targetOnly: PROD_ONLY_NAMES,
    }),
    ...(target.production
      ? [
          // branch の config は root の値を引き継ぐが、上書きもできるので両方を比べる
          ...checkValuesDiffer(values, stg, MUST_DIFFER_NAMES, target.config),
          ...checkValuesDiffer(
            deployValues,
            stgDeploy,
            MUST_DIFFER_NAMES,
            target.deployConfig
          ),
          ...checkLiveKeys(values),
        ]
      : []),
    ...checkEmptyValues(target.config, values, emptyOk),
    ...checkEmptyValues(target.deployConfig, deployValues, emptyOk),
    ...checkExpectedValues(values, EXPECTED_VALUES[target.env]),
    ...(await guarded(
      "Stripe",
      { values, names: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_APP_URL"] },
      () => stripeChecks(values, target)
    )),
    ...(await guarded(
      "Clerk: インスタンス",
      {
        values,
        names: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      },
      () => clerkInstanceChecks(values, target)
    )),
    ...(await guarded(
      "Clerk: Webhook",
      { values, names: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_APP_URL"] },
      () => clerkWebhookChecks(values)
    )),
    ...(await guarded(
      "Supabase",
      {
        values: deployValues,
        names: [
          "SUPABASE_DB_URL",
          "SUPABASE_PROJECT_REF",
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        ],
      },
      () => supabaseChecks(values, deployValues)
    )),
  ];

  const { text, failed } = formatResults(
    results,
    process.stdout.columns || 120
  );
  console.log(`対象: Doppler の ${target.config}・${target.deployConfig}\n`);
  console.log(text);
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
