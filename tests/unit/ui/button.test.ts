import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

describe("buttonVariants", () => {
  it("primaryバリアントはbg-primaryを含む", () => {
    expect(buttonVariants({ variant: "primary" })).toContain("bg-primary");
  });

  it("secondaryバリアントはbg-secondaryを含む", () => {
    expect(buttonVariants({ variant: "secondary" })).toContain("bg-secondary");
  });

  it("dangerバリアントはbg-dangerを含む", () => {
    expect(buttonVariants({ variant: "danger" })).toContain("bg-danger");
  });

  it("variant省略時はprimaryとして扱われる", () => {
    expect(buttonVariants({})).toContain("bg-primary");
  });

  it("disabled状態を表すクラスを常に含む", () => {
    expect(buttonVariants({ variant: "secondary" })).toContain(
      "disabled:opacity-50"
    );
  });
});
