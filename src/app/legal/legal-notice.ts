/**
 * 特定商取引法に基づく表記（第11条）と、注文の最終確認画面（第12条の6）に出す値（#695）。
 * 値はクライアントから届き次第ここだけを差し替える。`placeholder: true` の値は仮の文言で、
 * 画面にも「要差し替え」と出る。差し替えたら `placeholder` を消す
 */
export type LegalNoticeValue = {
  text: string;
  placeholder?: true;
};

export type LegalNoticeItem = {
  label: string;
  value: LegalNoticeValue;
};

export const LEGAL_LINKS = [
  { href: "/legal/terms", label: "利用規約" },
  { href: "/legal/privacy", label: "プライバシーポリシー" },
  { href: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
] as const;

export const PAYMENT_METHOD = {
  atOrder: {
    text: "クレジットカード（注文の確定後、Stripeの決済画面でお支払い）",
  },
  afterOrder: {
    text: "請求書払い（運営者が発行するStripeの請求書でお支払い）",
  },
} satisfies Record<string, LegalNoticeValue>;

export const PAYMENT_TIMING = {
  atOrder: { text: "注文の確定時" },
  afterOrder: { text: "請求書の発行日から7日以内" },
} satisfies Record<string, LegalNoticeValue>;

export const DELIVERY_TIMING: LegalNoticeValue = {
  text: "お支払いの確認後（請求書払いの商品は注文の確定後）、仕入れ先から入荷しだい発送します。目安は○営業日です",
  placeholder: true,
};

export const CANCELLATION_POLICY: LegalNoticeValue = {
  text: "受注後に仕入れ先へ発注するため、注文の確定後のお客様のご都合によるキャンセル・返品・交換はお受けしていません。不良品・誤配送の場合は、商品の到着から30日以内にご連絡ください。返送料は当社が負担します",
  placeholder: true,
};

export const TOKUSHOHO_ITEMS: LegalNoticeItem[] = [
  { label: "販売業者", value: { text: "株式会社○○", placeholder: true } },
  { label: "運営統括責任者", value: { text: "○○ ○○", placeholder: true } },
  {
    label: "所在地",
    value: { text: "〒000-0000 東京都○○区○○", placeholder: true },
  },
  {
    label: "電話番号",
    value: {
      text: "00-0000-0000（受付時間 平日10:00〜18:00）",
      placeholder: true,
    },
  },
  {
    label: "メールアドレス",
    value: { text: "info@example.com", placeholder: true },
  },
  {
    label: "販売価格",
    value: {
      text: "各商品のページに表示する価格（税込）。会員のランクにより価格が異なります。月会費は会員登録の画面に表示する金額（税込）です",
    },
  },
  {
    label: "商品代金以外の必要料金",
    value: {
      text: "送料は当社が負担します。銀行振込等の手数料が発生する場合はお客様のご負担となります",
      placeholder: true,
    },
  },
  {
    label: "支払方法",
    value: {
      text: `${PAYMENT_METHOD.atOrder.text}、または${PAYMENT_METHOD.afterOrder.text}。商品ごとに決まっており、注文確認の画面に表示します。月会費はクレジットカードでお支払いいただきます`,
    },
  },
  {
    label: "支払時期",
    value: {
      text: `クレジットカード: ${PAYMENT_TIMING.atOrder.text}。請求書払い: ${PAYMENT_TIMING.afterOrder.text}。月会費: 会員登録時と、以後毎月の更新日`,
    },
  },
  { label: "引渡時期", value: DELIVERY_TIMING },
  { label: "返品・交換・キャンセル", value: CANCELLATION_POLICY },
  {
    label: "動作環境",
    value: {
      text: "最新版の Google Chrome・Safari・Microsoft Edge・Firefox",
      placeholder: true,
    },
  },
];
