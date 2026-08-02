import { describe, it, expect } from "vitest";

import { filterAdapterDirectories } from "@/lib/product-import/filter-adapter-directories";

describe("filterAdapterDirectories", () => {
  it("__で始まるディレクトリ（雛形・テスト用）を除外する", () => {
    const result = filterAdapterDirectories([
      "__fixture__",
      "vendor-a",
      "vendor-b",
    ]);
    expect(result).toEqual(["vendor-a", "vendor-b"]);
  });

  it("該当ディレクトリが無ければ空配列を返す", () => {
    expect(filterAdapterDirectories(["__fixture__"])).toEqual([]);
  });

  it("全て実業者ディレクトリならそのまま返す", () => {
    expect(filterAdapterDirectories(["vendor-a"])).toEqual(["vendor-a"]);
  });
});
