/**
 * 特定商取引法に基づく表記（第11条）と、注文・入会の申込みの最終確認画面（第12条の6）に出す値（#695・#724）。
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

/** 画面の要素ではなく文字列（Server Action のエラー等）に値を入れるときに使う。仮の値の印を落とさない */
export function legalNoticePlainText(value: LegalNoticeValue): string {
  return value.placeholder ? `${value.text}（要差し替え）` : value.text;
}

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

// 運営の問い合わせ先。最低利用期間内の退会の連絡先としても出す（#724）
export const CONTACT = {
  email: { text: "info@example.com", placeholder: true },
  phone: {
    text: "00-0000-0000（受付時間 平日10:00〜18:00）",
    placeholder: true,
  },
} satisfies Record<string, LegalNoticeValue>;

/**
 * 入会（月額プランの申込み）の最終確認画面に出す条件（第12条の6。#724）。月額・初期費用はプランごとに
 * プラン選択の欄に出す。契約期間・解約の条件は法律の確認が済んでいない仮の文言（正式な規約は #240）
 */
export const MEMBERSHIP_TERMS = {
  price: {
    text: "月額・初期費用は、各プランの欄に表示した金額（税込）です。再入会の場合、以前に初期費用をお支払いいただいたプラン以下を選ぶと初期費用はかかりません（上回るプランは差額をお支払いいただきます）",
  },
  paymentMethod: {
    text: "クレジットカード（お申し込みの確定後、Stripeの決済画面でお支払い）",
  },
  paymentTiming: {
    text: "初期費用と初月の月額は、お申し込みの確定時（決済画面でのお支払い時）。2ヶ月目以降の月額は、毎月の更新日に自動で請求します",
  },
  contractPeriod: {
    text: "最低利用期間は入会日から6ヶ月です。以後は1ヶ月ごとに自動更新します",
    placeholder: true,
  },
  cancellation: {
    text: "入会から6ヶ月間（最低利用期間）は、ご自身で退会できません。期間内に退会をご希望の場合は運営へご連絡ください。最低利用期間の残りの月数分の月額を解約金としてお支払いいただいたうえで退会となります。6ヶ月を過ぎた後は、アカウント設定から退会でき（進行中の注文がある間を除く）、サブスクリプションはその場で解約されます",
    placeholder: true,
  },
} satisfies Record<string, LegalNoticeValue>;

export const TOKUSHOHO_ITEMS: LegalNoticeItem[] = [
  { label: "販売業者", value: { text: "株式会社○○", placeholder: true } },
  { label: "運営統括責任者", value: { text: "○○ ○○", placeholder: true } },
  {
    label: "所在地",
    value: { text: "〒000-0000 東京都○○区○○", placeholder: true },
  },
  { label: "電話番号", value: CONTACT.phone },
  { label: "メールアドレス", value: CONTACT.email },
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
