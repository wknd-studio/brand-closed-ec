import { describe, it, expect, vi } from "vitest";

import { repositoryFrom } from "@/lib/issue-deps-graph/repository";

describe("repositoryFrom", () => {
  it("CIではGITHUB_REPOSITORY（owner/name）から取り、ghは呼ばない", () => {
    const ghRepoView = vi.fn(() => "other/repo");
    expect(repositoryFrom("new-org/brand-closed-ec", ghRepoView)).toEqual({
      owner: "new-org",
      name: "brand-closed-ec",
    });
    expect(ghRepoView).not.toHaveBeenCalled();
  });

  it("GITHUB_REPOSITORYが無ければ、gh repo view の結果から取る（末尾の改行は除く）", () => {
    expect(
      repositoryFrom(undefined, () => "wknd-studio/brand-closed-ec\n")
    ).toEqual({ owner: "wknd-studio", name: "brand-closed-ec" });
  });

  it("GITHUB_REPOSITORYが空文字なら設定されていないものとして扱う", () => {
    expect(repositoryFrom("", () => "a/b")).toEqual({ owner: "a", name: "b" });
  });

  it.each(["brand-closed-ec", "a/b/c", "/b", "a/"])(
    "owner/name の形でなければ（%j）エラーにする",
    (value) => {
      expect(() => repositoryFrom(value, () => "a/b")).toThrow(
        "リポジトリ名を owner/name の形で取れなかった"
      );
    }
  );
});
