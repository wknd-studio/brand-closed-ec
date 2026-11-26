import { describe, expect, it } from "vitest";
import { presentOrderComplete } from "@/app/(member)/order/order-complete-presenter";

const cardItem = {
  id: "i1",
  productNameSnapshot: "レザートートバッグ",
  quantity: 1,
  unitPriceSnapshot: 31_200,
  isNegotiable: false,
};
const negotiableItem = {
  id: "i2",
  productNameSnapshot: "スエードローファー",
  quantity: 2,
  unitPriceSnapshot: null,
  isNegotiable: true,
};
const invoiceItem = {
  id: "i3",
  productNameSnapshot: "リネンワイドパンツ",
  quantity: 5,
  unitPriceSnapshot: 14_300,
  isNegotiable: false,
};

const BASE = {
  orderNumber: "K7Q2-M9XD",
  createdAt: "2026-11-24T03:00:00.000Z",
};

describe("注文完了の画面に出す内容（presentOrderComplete）", () => {
  it("注文番号は受け取った表示の形のまま、日付は日本の日付で出す", () => {
    const view = presentOrderComplete({
      ...BASE,
      atOrderItems: [cardItem],
      afterOrderItems: [],
    });

    expect(view.orderNumber).toBe("K7Q2-M9XD");
    expect(view.orderDate).toBe("2026/11/24");
  });

  describe("カードのみ", () => {
    const view = presentOrderComplete({
      ...BASE,
      atOrderItems: [cardItem, negotiableItem],
      afterOrderItems: [],
    });

    it("お支払いの完了を出し、請求書の案内は出さない", () => {
      expect(view.eyebrow).toBe("THANK YOU");
      expect(view.invoiceNotice).toBeNull();
      expect(view.steps).toEqual([
        { title: "お支払い", body: "お支払いが完了しました。", done: true },
        {
          title: "仕入れ先へ発注",
          body: "運営者が仕入れ先へ発注します。",
          done: false,
        },
        {
          title: "発送",
          body: "入荷しだい発送します。発送の状況は注文履歴で確かめられます。",
          done: false,
        },
      ]);
    });

    it("明細は単価×数量・支払い方法と小計、要相談は「要相談」で出し、合計は要相談を除いた額", () => {
      expect(view.items).toEqual([
        {
          id: "i1",
          name: "レザートートバッグ",
          detail: "¥31,200 × 1・カード",
          lineTotal: "¥31,200",
        },
        {
          id: "i2",
          name: "スエードローファー",
          detail: "価格要相談 × 2",
          lineTotal: "要相談",
        },
      ]);
      expect(view.total).toEqual({
        label: "合計（価格要相談を除く）",
        amount: "¥31,200",
      });
    });
  });

  describe("請求書のみ", () => {
    const view = presentOrderComplete({
      ...BASE,
      atOrderItems: [],
      afterOrderItems: [invoiceItem],
    });

    it("注文の受付と請求書の送付を出す", () => {
      expect(view.eyebrow).toBe("ORDER RECEIVED");
      expect(view.invoiceNotice).toBe(
        "運営者が内容を確認したあと、請求書をお送りします。請求書の発行日から7日以内にお支払いください。"
      );
      expect(view.steps).toEqual([
        {
          title: "ご注文の受付",
          body: "ご注文を受け付けました。",
          done: true,
        },
        {
          title: "請求書の送付",
          body: "運営者が内容を確認したあと、請求書をお送りします。請求書の発行日から7日以内にお支払いください。",
          done: false,
        },
        {
          title: "発送",
          body: "仕入れ先から入荷しだい発送します。",
          done: false,
        },
      ]);
    });

    it("要相談の商品が無ければ、合計の見出しは「合計」", () => {
      expect(view.items[0].detail).toBe("¥14,300 × 5・請求書");
      expect(view.total).toEqual({ label: "合計", amount: "¥71,500" });
    });

    it("固定価格の商品が無ければ、合計を出さない", () => {
      const onlyNegotiable = presentOrderComplete({
        ...BASE,
        atOrderItems: [],
        afterOrderItems: [negotiableItem],
      });

      expect(onlyNegotiable.total).toBeNull();
    });
  });

  describe("カードと請求書の両方", () => {
    const view = presentOrderComplete({
      ...BASE,
      atOrderItems: [cardItem],
      afterOrderItems: [invoiceItem],
    });

    it("カードの分のお支払いの完了と、請求書払いの商品の案内を出す", () => {
      expect(view.eyebrow).toBe("THANK YOU");
      expect(view.steps[0]).toEqual({
        title: "お支払い",
        body: "クレジットカードの商品のお支払いが完了しました。",
        done: true,
      });
      expect(view.invoiceNotice).toBe(
        "請求書払いの商品（リネンワイドパンツ・¥71,500）は、運営者が内容を確認したあと、請求書をお送りします。"
      );
    });

    it("明細はカード・請求書の順に並べ、合計は両方の額", () => {
      expect(view.items.map((i) => i.name)).toEqual([
        "レザートートバッグ",
        "リネンワイドパンツ",
      ]);
      expect(view.total).toEqual({ label: "合計", amount: "¥102,700" });
    });

    it("請求書払いの商品に要相談しか無ければ、案内に額を出さない", () => {
      const mixed = presentOrderComplete({
        ...BASE,
        atOrderItems: [cardItem],
        afterOrderItems: [negotiableItem],
      });

      expect(mixed.invoiceNotice).toBe(
        "請求書払いの商品（スエードローファー）は、運営者が内容を確認したあと、請求書をお送りします。"
      );
    });
  });
});
