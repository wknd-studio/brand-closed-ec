import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  markPendingCsvImported,
  fetchCsvUploadText,
} from "@/lib/product-import/csv-upload";

describe("markPendingCsvImported", () => {
  it("対象csvCatalogのpending_csvフィールドを削除する", async () => {
    const patched: { id: string; unsetFields: string[] }[] = [];
    const client = {
      patch: (id: string) => ({
        unset: (fields: string[]) => ({
          commit: () => {
            patched.push({ id, unsetFields: fields });
            return Promise.resolve({ _id: id });
          },
        }),
      }),
    } as unknown as import("@sanity/client").SanityClient;

    await markPendingCsvImported(client, "catalog-1");

    expect(patched).toEqual([
      { id: "catalog-1", unsetFields: ["pending_csv"] },
    ]);
  });
});

describe("fetchCsvUploadText", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("file assetのURLを取得しテキストを返す", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("jan_code,name\n123,商品A"),
    });

    const result = await fetchCsvUploadText(
      "https://cdn.sanity.io/files/proj/ds/abc.csv"
    );

    expect(result).toBe("jan_code,name\n123,商品A");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://cdn.sanity.io/files/proj/ds/abc.csv"
    );
  });

  it("取得に失敗した場合はエラーを投げる", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      fetchCsvUploadText("https://cdn.sanity.io/files/proj/ds/missing.csv")
    ).rejects.toThrow("CSVファイルの取得に失敗しました");
  });
});
