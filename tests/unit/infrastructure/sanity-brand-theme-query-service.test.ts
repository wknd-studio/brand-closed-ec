import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/infrastructure/sanity/client", () => ({
  sanityClient: { fetch: fetchMock },
}));

const { SanityBrandThemeQueryService } =
  await import("@/infrastructure/sanity/sanity-brand-theme-query-service");

const service = new SanityBrandThemeQueryService();

beforeEach(() => {
  fetchMock.mockReset();
});

describe("SanityBrandThemeQueryService.findBrandTheme", () => {
  it("ブランド名で絞り、ブランドに紐づくデザインテーマの配色・フォント・バナーを返す", async () => {
    const theme = {
      primaryColorHex: "#112233",
      accentColorHex: "#445566",
      font: "noto-serif-jp",
      bannerUrl: "https://cdn.example/banner.jpg",
    };
    fetchMock.mockResolvedValue(theme);

    const result = await service.findBrandTheme("ブランドA");

    const [query, params] = fetchMock.mock.calls[0];
    expect(query).toContain('_type=="brand"&&name==$brandName');
    expect(query).toContain("design_theme->");
    expect(params).toEqual({ brandName: "ブランドA" });
    expect(result).toEqual(theme);
  });

  it("ブランドが無い・テーマが未設定なら null を返す", async () => {
    fetchMock.mockResolvedValue(null);

    expect(await service.findBrandTheme("存在しないブランド")).toBeNull();
  });
});
