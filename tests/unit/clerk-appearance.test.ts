import { describe, expect, it } from "vitest";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { buttonVariants } from "@/components/ui/button";
import { headingVariants } from "@/components/ui/heading";

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);

// 「hover:!underline」の「!」を外して「hover:underline」にする
const withoutImportant = (token: string) => token.replace(/(^|:)!/, "$1");

describe("clerkAppearance", () => {
  // Clerkのスタイル（CSS-in-JS）はTailwindのユーティリティより後から当たり、
  // !の無い指定は負けて効かないため（#757）
  it("すべての要素のクラスが!付きである", () => {
    for (const [element, className] of Object.entries(
      clerkAppearance.elements
    )) {
      for (const token of tokens(className)) {
        expect(withoutImportant(token), `${element}: ${token}`).not.toBe(token);
      }
    }
  });

  it("Clerkのカードの影・枠・余白・背景を消し、余白0でも入力欄の枠が切れないようにする", () => {
    const { cardBox, card, footer } = clerkAppearance.elements;
    expect(tokens(cardBox)).toEqual(
      expect.arrayContaining([
        "!overflow-visible",
        "!rounded-none",
        "!border-none",
        "!shadow-none",
      ])
    );
    expect(tokens(card)).toEqual(
      expect.arrayContaining([
        "!overflow-visible",
        "!border-none",
        "!bg-transparent",
        "!p-0",
        "!shadow-none",
      ])
    );
    // Clerkはフッターにグラデーションのbackground-imageを当てている
    expect(tokens(footer)).toEqual(
      expect.arrayContaining(["!bg-none", "!bg-transparent"])
    );
  });

  it("見出し・主ボタンはデザインシステムのHeading・Buttonと同じ指定を!付きで持つ", () => {
    const { headerTitle, formButtonPrimary } = clerkAppearance.elements;
    expect(tokens(headerTitle).map(withoutImportant)).toEqual(
      expect.arrayContaining(tokens(headingVariants({ level: "compact" })))
    );
    expect(tokens(formButtonPrimary).map(withoutImportant)).toEqual(
      expect.arrayContaining(tokens(buttonVariants({ variant: "primary" })))
    );
  });
});
