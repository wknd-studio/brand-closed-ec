import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import {
  checkClerkInstance,
  checkClerkWebhook,
  checkExpectedValues,
  checkLiveKeys,
  checkMigrations,
  checkNames,
  checkStripePrices,
  checkStripeWebhook,
  checkSupabaseThirdPartyAuth,
  checkValuesDiffer,
  clerkFrontendApiHost,
  formatResults,
  handledEventTypes,
  parseTarget,
  type CheckResult,
} from "../../scripts/check-env";

const statuses = (results: CheckResult[]) =>
  results.map((r) => `${r.status} ${r.name}`);

describe("parseTarget", () => {
  it("stg と prod だけを受け付け、Worker 用とデプロイ用の config を返す", () => {
    expect(parseTarget(["prod"])).toEqual({
      env: "prod",
      production: true,
      config: "prod",
      deployConfig: "prod_deploy",
    });
    expect(parseTarget(["stg"])).toMatchObject({
      production: false,
      deployConfig: "stg_deploy",
    });
    expect(() => parseTarget([])).toThrow(/stg か prod/);
    expect(() => parseTarget(["dev"])).toThrow(/stg か prod/);
  });
});

describe("checkNames", () => {
  it("stg にあって対象に無い名前・対象にだけある名前を NG にし、許可リストのものは除く", () => {
    const results = checkNames({
      label: "prod",
      target: ["A", "OLD", "ONLY_PROD_OK"],
      reference: ["A", "B", "RESEND_TEST_TO"],
      referenceOnly: { RESEND_TEST_TO: "stg だけ" },
      targetOnly: { ONLY_PROD_OK: "本番だけ" },
    });
    expect(statuses(results)).toEqual(["ng prod: 名前"]);
    expect(results[0].detail).toContain("足りない: B");
    expect(results[0].detail).toContain("stg に無い: OLD");
    expect(results[0].detail).not.toContain("RESEND_TEST_TO");
    expect(results[0].fix).toBeTruthy();
  });

  it("許可リストの stg だけの名前が対象にあれば NG（本番に stg 用の値を持ち込まない）", () => {
    const results = checkNames({
      label: "prod",
      target: ["A", "RESEND_TEST_TO"],
      reference: ["A", "RESEND_TEST_TO"],
      referenceOnly: { RESEND_TEST_TO: "全メールの宛先を差し替える" },
      targetOnly: {},
    });
    expect(results[0].status).toBe("ng");
    expect(results[0].detail).toContain(
      "stg だけのはずの名前がある: RESEND_TEST_TO"
    );
  });

  it("そろっていれば OK", () => {
    expect(
      statuses(
        checkNames({
          label: "stg",
          target: ["A", "B"],
          reference: ["B", "A"],
          referenceOnly: {},
          targetOnly: {},
        })
      )
    ).toEqual(["ok stg: 名前"]);
  });
});

describe("checkValuesDiffer", () => {
  it("stg と同じ値のものを NG にし、値そのものは出さない", () => {
    const results = checkValuesDiffer(
      { K1: "same-secret", K2: "prod-value" },
      { K1: "same-secret", K2: "stg-value" },
      ["K1", "K2", "K3"]
    );
    expect(statuses(results)).toEqual(["ng 値が stg と違う"]);
    expect(results[0].detail).toBe("stg と同じ値: K1");
    expect(JSON.stringify(results)).not.toContain("same-secret");
  });

  it("全て違えば OK（どちらかに無い名前は名前の検査に任せる）", () => {
    expect(
      statuses(
        checkValuesDiffer({ K1: "a" }, { K1: "b", K2: "c" }, ["K1", "K2"])
      )
    ).toEqual(["ok 値が stg と違う"]);
  });
});

describe("checkLiveKeys", () => {
  it("Stripe・Clerk のキーが live でなければ NG。値は先頭の種類だけ出す", () => {
    const results = checkLiveKeys({
      STRIPE_SECRET_KEY: "sk_test_abcdef",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x",
      CLERK_SECRET_KEY: "sk_live_x",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
    });
    expect(statuses(results)).toEqual(["ng live のキー"]);
    expect(results[0].detail).toContain("STRIPE_SECRET_KEY（sk_test_）");
    expect(results[0].detail).toContain(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY（pk_test_）"
    );
    expect(results[0].detail).not.toContain("abcdef");
  });

  it("Stripe の制限付きキー（rk_live_）も live として認める", () => {
    expect(
      statuses(
        checkLiveKeys({
          STRIPE_SECRET_KEY: "rk_live_x",
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x",
          CLERK_SECRET_KEY: "sk_live_x",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_x",
        })
      )
    ).toEqual(["ok live のキー"]);
  });
});

describe("checkExpectedValues", () => {
  it("決まった値が違うものを NG にする", () => {
    const results = checkExpectedValues(
      {
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "stg",
        NEXT_PUBLIC_SANITY_DATASET: "production",
      },
      {
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "prod",
        NEXT_PUBLIC_SANITY_DATASET: "production",
      }
    );
    expect(statuses(results)).toEqual(["ng 決まった値"]);
    expect(results[0].detail).toBe(
      "NEXT_PUBLIC_SENTRY_ENVIRONMENT が stg（期待: prod）"
    );
  });
});

describe("handledEventTypes", () => {
  it("Webhook のルートが分岐する event.type を集める", () => {
    expect(
      handledEventTypes(
        'if (event.type === "a.b") {}\nif (event.type === "c.d" || event.type === "a.b") {}'
      )
    ).toEqual(["a.b", "c.d"]);
  });

  it("実際のルートから Stripe・Clerk のイベントを読める", () => {
    const stripe = handledEventTypes(
      readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8")
    );
    const clerk = handledEventTypes(
      readFileSync("src/app/api/webhooks/clerk/route.ts", "utf8")
    );
    expect(stripe).toContain("checkout.session.completed");
    expect(stripe).toContain("invoice.paid");
    expect(clerk).toContain("user.created");
    expect(clerk).toContain("organizationMembership.deleted");
  });
});

describe("checkStripeWebhook", () => {
  const appUrl = "https://shop.example.com/";

  it("本番の URL に向いた有効な送り先が、処理するイベントを全部受け取れば OK", () => {
    expect(
      statuses(
        checkStripeWebhook(
          [
            {
              url: "https://shop.example.com/api/webhooks/stripe",
              status: "enabled",
              enabled_events: ["checkout.session.completed", "invoice.paid"],
            },
          ],
          appUrl,
          ["checkout.session.completed", "invoice.paid"]
        )
      )
    ).toEqual(["ok Stripe: Webhook"]);
  });

  it("全イベント（*）を受け取る送り先も OK", () => {
    expect(
      checkStripeWebhook(
        [
          {
            url: "https://shop.example.com/api/webhooks/stripe",
            status: "enabled",
            enabled_events: ["*"],
          },
        ],
        appUrl,
        ["invoice.paid"]
      )[0].status
    ).toBe("ok");
  });

  it("送り先が無い・無効・イベントが足りないものを NG にする", () => {
    expect(checkStripeWebhook([], appUrl, ["invoice.paid"])[0]).toMatchObject({
      status: "ng",
      detail: expect.stringContaining(
        "https://shop.example.com/api/webhooks/stripe"
      ),
    });
    expect(
      checkStripeWebhook(
        [
          {
            url: "https://shop.example.com/api/webhooks/stripe",
            status: "disabled",
            enabled_events: ["invoice.paid"],
          },
        ],
        appUrl,
        ["invoice.paid"]
      )[0].status
    ).toBe("ng");
    const missing = checkStripeWebhook(
      [
        {
          url: "https://shop.example.com/api/webhooks/stripe",
          status: "enabled",
          enabled_events: ["invoice.paid"],
        },
      ],
      appUrl,
      ["checkout.session.completed", "invoice.paid"]
    )[0];
    expect(missing.status).toBe("ng");
    expect(missing.detail).toContain("checkout.session.completed");
  });
});

describe("checkStripePrices", () => {
  it("Price が存在し・有効で・キーと同じモードで・種類が合えば OK", () => {
    expect(
      statuses(
        checkStripePrices(
          [
            {
              name: "STRIPE_PRICE_ID_PRO",
              price: { active: true, livemode: true, type: "recurring" },
            },
            {
              name: "STRIPE_PRICE_ID_PRO_INITIAL_FEE",
              price: { active: true, livemode: true, type: "one_time" },
            },
          ],
          true
        )
      )
    ).toEqual(["ok Stripe: Price"]);
  });

  it("無い・無効・モード違い・種類違いを NG にする", () => {
    const [result] = checkStripePrices(
      [
        { name: "STRIPE_PRICE_ID_STARTER", price: null },
        {
          name: "STRIPE_PRICE_ID_BASIC",
          price: { active: false, livemode: true, type: "recurring" },
        },
        {
          name: "STRIPE_PRICE_ID_STANDARD",
          price: { active: true, livemode: false, type: "recurring" },
        },
        {
          name: "STRIPE_PRICE_ID_PRO_INITIAL_FEE",
          price: { active: true, livemode: true, type: "recurring" },
        },
      ],
      true
    );
    expect(result.status).toBe("ng");
    expect(result.detail).toContain("STRIPE_PRICE_ID_STARTER: 無い");
    expect(result.detail).toContain("STRIPE_PRICE_ID_BASIC: 無効");
    expect(result.detail).toContain("STRIPE_PRICE_ID_STANDARD: テストモード");
    expect(result.detail).toContain(
      "STRIPE_PRICE_ID_PRO_INITIAL_FEE: 種類が recurring（期待: one_time）"
    );
  });

  it("Price の名前が1つも無ければ NG", () => {
    expect(checkStripePrices([], true)[0].status).toBe("ng");
  });
});

describe("clerkFrontendApiHost", () => {
  it("publishable key から Frontend API のホストを取り出す", () => {
    const encoded = Buffer.from("clerk.example.com$").toString("base64");
    expect(clerkFrontendApiHost(`pk_live_${encoded}`)).toBe(
      "clerk.example.com"
    );
    expect(clerkFrontendApiHost("garbage")).toBeNull();
  });
});

describe("checkClerkInstance", () => {
  const pk = `pk_live_${Buffer.from("clerk.example.com$").toString("base64")}`;
  const domain = {
    name: "example.com",
    frontend_api_url: "https://clerk.example.com",
  };

  it("本番: 本番のインスタンスで、キーとドメインが一致し、アプリの URL がドメインの下なら OK", () => {
    expect(
      statuses(
        checkClerkInstance({
          environmentType: "production",
          domains: [domain],
          publishableKey: pk,
          appUrl: "https://shop.example.com",
          production: true,
        })
      )
    ).toEqual(["ok Clerk: インスタンス"]);
  });

  it("本番: 開発のインスタンス・キーとドメインの不一致・アプリの URL がドメイン外を NG にする", () => {
    const [result] = checkClerkInstance({
      environmentType: "development",
      domains: [
        {
          name: "foo.lcl.dev",
          frontend_api_url: "https://other.clerk.accounts.dev",
        },
      ],
      publishableKey: pk,
      appUrl: "https://shop.example.net",
      production: true,
    });
    expect(result.status).toBe("ng");
    expect(result.detail).toContain("development");
    expect(result.detail).toContain("clerk.example.com");
    expect(result.detail).toContain("shop.example.net");
  });

  it("stg: 開発のインスタンスでよく、ドメインの下かは問わない", () => {
    const devPk = `pk_test_${Buffer.from("x.clerk.accounts.dev$").toString("base64")}`;
    expect(
      checkClerkInstance({
        environmentType: "development",
        domains: [
          {
            name: "x.lcl.dev",
            frontend_api_url: "https://x.clerk.accounts.dev",
          },
        ],
        publishableKey: devPk,
        appUrl: "https://stg.workers.dev",
        production: false,
      })[0].status
    ).toBe("ok");
  });
});

describe("checkClerkWebhook", () => {
  const appUrl = "https://shop.example.com";

  it("有効な送り先がアプリのルートに向き、処理するイベントを全部受け取れば OK", () => {
    expect(
      checkClerkWebhook(
        [
          {
            url: "https://shop.example.com/api/webhooks/clerk",
            disabled: false,
            filterTypes: ["user.created", "user.deleted"],
          },
        ],
        appUrl,
        ["user.created", "user.deleted"]
      )[0].status
    ).toBe("ok");
  });

  it("filterTypes が空なら全イベントを受け取るので OK", () => {
    expect(
      checkClerkWebhook(
        [
          {
            url: "https://shop.example.com/api/webhooks/clerk",
            disabled: false,
            filterTypes: null,
          },
        ],
        appUrl,
        ["user.created"]
      )[0].status
    ).toBe("ok");
  });

  it("無効な送り先・足りないイベントは NG", () => {
    expect(
      checkClerkWebhook(
        [
          {
            url: "https://shop.example.com/api/webhooks/clerk",
            disabled: true,
            filterTypes: [],
          },
        ],
        appUrl,
        ["user.created"]
      )[0].status
    ).toBe("ng");
    const missing = checkClerkWebhook(
      [
        {
          url: "https://shop.example.com/api/webhooks/clerk",
          disabled: false,
          filterTypes: ["user.created"],
        },
      ],
      appUrl,
      ["user.created", "user.deleted"]
    )[0];
    expect(missing.status).toBe("ng");
    expect(missing.detail).toContain("user.deleted");
  });
});

describe("checkSupabaseThirdPartyAuth", () => {
  it("Clerk の Frontend API のドメインが third-party auth に登録されていれば OK", () => {
    expect(
      checkSupabaseThirdPartyAuth(
        [{ type: "clerk", oidc_issuer_url: "https://clerk.example.com" }],
        "clerk.example.com"
      )[0].status
    ).toBe("ok");
  });

  it("登録が無い・別のドメインなら NG", () => {
    const [result] = checkSupabaseThirdPartyAuth(
      [{ type: "clerk", oidc_issuer_url: "https://x.clerk.accounts.dev" }],
      "clerk.example.com"
    );
    expect(result.status).toBe("ng");
    expect(result.detail).toContain("x.clerk.accounts.dev");
  });

  it("管理用のトークンが無く読めなければ SKIP（確かめていない）", () => {
    expect(
      checkSupabaseThirdPartyAuth(null, "clerk.example.com")[0]
    ).toMatchObject({
      status: "skip",
      fix: expect.stringContaining("SUPABASE_ACCESS_TOKEN"),
    });
  });
});

describe("checkMigrations", () => {
  it("ローカルのマイグレーションが全てリモートに適用されていれば OK", () => {
    expect(checkMigrations(["1", "2"], ["1", "2"])[0].status).toBe("ok");
  });

  it("未適用・リモートにだけあるものを NG にする", () => {
    const [result] = checkMigrations(["1", "2", "3"], ["1", "9"]);
    expect(result.status).toBe("ng");
    expect(result.detail).toContain("未適用: 2, 3");
    expect(result.detail).toContain("リモートにだけある: 9");
  });
});

describe("formatResults", () => {
  it("項目ごとに OK / NG / SKIP と、NG・SKIP の直し方を出し、NG があれば失敗を返す", () => {
    const { text, failed } = formatResults([
      { name: "A", status: "ok" },
      { name: "B", status: "ng", detail: "壊れている", fix: "直す" },
      { name: "C", status: "skip", detail: "読めない", fix: "トークンを渡す" },
    ]);
    expect(text).toContain("OK   A");
    expect(text).toContain("NG   B: 壊れている");
    expect(text).toContain("直し方: 直す");
    expect(text).toContain("SKIP C: 読めない");
    expect(text).toContain("NG 1件・SKIP 1件");
    expect(failed).toBe(true);
  });

  it("全て OK なら成功", () => {
    expect(formatResults([{ name: "A", status: "ok" }]).failed).toBe(false);
  });
});
