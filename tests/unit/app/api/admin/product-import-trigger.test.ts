import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const sanityFetchMock = vi.fn();

vi.mock("@/lib/sanity/client", () => ({
  sanityClient: { fetch: sanityFetchMock },
}));

const VALID_TOKEN = "test-shared-secret";

describe("POST /api/admin/product-import/trigger", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PRODUCT_IMPORT_TRIGGER_TOKEN", VALID_TOKEN);
    vi.stubEnv("PRODUCT_IMPORT_GITHUB_TOKEN", "gh-pat");
    fetchMock.mockReset();
    sanityFetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("トークンが不正な場合401を返す", async () => {
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: { "X-Product-Import-Token": "wrong-token" },
        body: JSON.stringify({ catalogId: "scraping-catalog-b" }),
      })
    );

    expect(res.status).toBe(401);
    expect(sanityFetchMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("対象がscrapingCatalog型でない場合400を返す", async () => {
    sanityFetchMock.mockResolvedValueOnce(null);
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: { "X-Product-Import-Token": VALID_TOKEN },
        body: JSON.stringify({ catalogId: "csv-catalog-a" }),
      })
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("catalogIdが無い場合400を返す", async () => {
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: { "X-Product-Import-Token": VALID_TOKEN },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    expect(sanityFetchMock).not.toHaveBeenCalled();
  });

  it("正常系: GitHub Actionsのworkflow_dispatchを呼び出し202を返す", async () => {
    sanityFetchMock.mockResolvedValueOnce({ _id: "scraping-catalog-b" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: { "X-Product-Import-Token": VALID_TOKEN },
        body: JSON.stringify({ catalogId: "scraping-catalog-b" }),
      })
    );

    expect(res.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      "/actions/workflows/product-data-sync.yml/dispatches"
    );
    expect(init.headers.Authorization).toBe("Bearer gh-pat");
    const body = JSON.parse(init.body);
    expect(body.inputs.catalogId).toBe("scraping-catalog-b");
  });

  it("GitHub Actions呼び出しが失敗した場合502を返す", async () => {
    sanityFetchMock.mockResolvedValueOnce({ _id: "scraping-catalog-b" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: { "X-Product-Import-Token": VALID_TOKEN },
        body: JSON.stringify({ catalogId: "scraping-catalog-b" }),
      })
    );

    expect(res.status).toBe(502);
  });

  it("StudioのデプロイURLからのリクエストにCORSヘッダーを付与する", async () => {
    sanityFetchMock.mockResolvedValueOnce({ _id: "scraping-catalog-b" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: {
          "X-Product-Import-Token": VALID_TOKEN,
          Origin: "https://brand-closed-ec.sanity.studio",
        },
        body: JSON.stringify({ catalogId: "scraping-catalog-b" }),
      })
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://brand-closed-ec.sanity.studio"
    );
  });

  it("許可されていないOriginにはCORSヘッダーを付与しない", async () => {
    sanityFetchMock.mockResolvedValueOnce({ _id: "scraping-catalog-b" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { POST } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await POST(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "POST",
        headers: {
          "X-Product-Import-Token": VALID_TOKEN,
          Origin: "https://evil.example.com",
        },
        body: JSON.stringify({ catalogId: "scraping-catalog-b" }),
      })
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("OPTIONSプリフライトに204とCORSヘッダーを返す", async () => {
    const { OPTIONS } =
      await import("@/app/api/admin/product-import/trigger/route");

    const res = await OPTIONS(
      new Request("http://localhost/api/admin/product-import/trigger", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3333" },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3333"
    );
  });
});
