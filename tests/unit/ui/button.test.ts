import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

describe("buttonVariants", () => {
  it("primaryバリアントはprimaryカラーのグラデーション背景を含む", () => {
    expect(buttonVariants({ variant: "primary" })).toContain(
      "from-primary-light"
    );
    expect(buttonVariants({ variant: "primary" })).toContain("to-primary");
  });

  it("secondaryバリアントはborderスタイルを含む", () => {
    expect(buttonVariants({ variant: "secondary" })).toContain(
      "border-neutral-200"
    );
  });

  it("dangerバリアントはbg-dangerを含む", () => {
    expect(buttonVariants({ variant: "danger" })).toContain("bg-danger");
  });

  it("variant省略時はprimaryとして扱われる", () => {
    expect(buttonVariants({})).toContain("from-primary-light");
  });

  it("disabled状態を表すクラスを常に含む", () => {
    expect(buttonVariants({ variant: "secondary" })).toContain(
      "disabled:opacity-50"
    );
  });
});
