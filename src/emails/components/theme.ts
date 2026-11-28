/**
 * 会員向けメールの色・書体。メールでは CSS 変数が使えないため、サイトのトークン
 * （src/app/globals.css）と同じ値をここに持つ。トークンを変えたらここも合わせる
 */
export const EMAIL_COLORS = {
  // --color-neutral-*
  surface: "#ffffff",
  surfaceMuted: "#faf8f2", // neutral-50
  canvas: "#f4f0e6", // neutral-100（メールの外側の背景・表の区切り線）
  border: "#e6e0d0", // neutral-200
  textBody: "#3a352a", // neutral-800
  textMuted: "#574f40", // neutral-700
  text: "#221f1a", // neutral-900
  // --color-primary・--color-primary-strong
  accent: "#a9791d",
  accentText: "#8a6215",
  // サイトのボタン（primary-light → primary のグラデーション）の中ほどの単色。グラデーションは
  // メールソフトによって出ないため単色にする。文字は --color-primary-foreground（4.5:1 以上）
  buttonBackground: "#c99a3a",
  buttonText: "#2a1f08",
  // お知らせの枠。文字は --color-info。warning の文字は --color-warning では淡い背景で 4.5:1 に
  // 届かないため、同じ色相で濃くしたもの
  infoBackground: "#eef3f9",
  infoBorder: "#cfdcec",
  infoText: "#1d4f91",
  warningBackground: "#fbf0e4",
  warningBorder: "#f3d3a8",
  warningText: "#7a3a0a",
} as const;

export const EMAIL_FONTS = {
  sans: "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif",
  // --font-display（見出しの明朝体）
  display: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
} as const;

/** ロゴ・規約等のリンクは、メールソフトから開くため本番ドメインの絶対 URL にする */
export function appUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
}
