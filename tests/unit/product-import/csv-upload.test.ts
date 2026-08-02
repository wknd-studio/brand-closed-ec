import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  markCsvUploadImported,
  fetchCsvUploadText,
} from "@/lib/product-import/csv-upload";

describe("markCsvUploadImported", () => {
  it("対象のproductCsvUploadドキュメントのstatusをimportedに更新する", async () => {
    const patched: { id: string; doc: Record<string, unknown> }[] = [];
    const client = {
      patch: (id: string) => ({
        set: (doc: Record<string, unknown>) => ({
          commit: () => {
            patched.push({ id, doc });
            return Promise.resolve({ _id: id, ...doc });
          },
        }),
      }),
    } as unknown as import("@sanity/client").SanityClient;

    await markCsvUploadImported(client, "upload-1");

    expect(patched).toEqual([{ id: "upload-1", doc: { status: "imported" } }]);
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
