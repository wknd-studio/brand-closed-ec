import { Button, Heading, Section, Text } from "@react-email/components";
import { Fragment, type ReactNode } from "react";
import { EMAIL_COLORS, EMAIL_FONTS } from "./theme";

/** 改行（\n）を <br /> にする。メールソフトによって white-space: pre-line が効かないため */
function withLineBreaks(text: string): ReactNode {
  return text.split("\n").map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

export function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/** 小見出し（英字）・見出し・導入の文 */
export function EmailHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead: string;
}) {
  return (
    <>
      <Text style={eyebrowStyle}>{eyebrow}</Text>
      <Heading as="h1" style={titleStyle}>
        {title}
      </Heading>
      <Text style={leadStyle}>{withLineBreaks(lead)}</Text>
    </>
  );
}

const STEPS = [
  { key: "ordered", label: "ご注文" },
  { key: "paid", label: "お支払い" },
  { key: "shipped", label: "発送" },
  { key: "delivered", label: "お届け" },
] as const;

export type OrderProgressStep = (typeof STEPS)[number]["key"];

/** 注文の進み具合。current までの段を塗り、current の名前を太字にする */
export function OrderProgress({ current }: { current: OrderProgressStep }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <table role="presentation" style={progressTable}>
      <tbody>
        <tr>
          {STEPS.map((step, i) => (
            <td key={step.key} style={progressCell}>
              <div
                style={{
                  ...progressBar,
                  backgroundColor:
                    i <= currentIndex
                      ? EMAIL_COLORS.accent
                      : EMAIL_COLORS.border,
                }}
              />
              <div
                style={
                  i === currentIndex ? progressLabelCurrent : progressLabel
                }
              >
                {step.label}
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** 注文番号とご注文日。注文番号は渡された文字列をそのまま出す */
export function OrderMeta({
  orderNumber,
  orderedAt,
}: {
  orderNumber: string;
  orderedAt?: Date;
}) {
  return (
    <table role="presentation" style={metaTable}>
      <tbody>
        <tr>
          <td style={metaCell}>
            注文番号
            <br />
            <span style={metaNumber}>{orderNumber}</span>
          </td>
          {orderedAt && (
            <td style={{ ...metaCell, textAlign: "right" }}>
              ご注文日
              <br />
              <span style={metaDate}>{formatJstDate(orderedAt)}</span>
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

// 実行環境（WorkersはUTC）ではなくJSTの日付を「2026/11/24」の形で出す
export function formatJstDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export type EmailLineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

function isPriced(
  item: EmailLineItem
): item is EmailLineItem & { unitPrice: number } {
  return !item.isNegotiable && item.unitPrice !== null;
}

/** 内容の表。total は要相談を除いた固定額の合計（計算は送る側で domain の関数を使う） */
export function LineItemsTable({
  title,
  items,
  total,
}: {
  title: string;
  items: EmailLineItem[];
  total: number;
}) {
  const hasNegotiable = items.some((item) => item.isNegotiable);
  return (
    <>
      <Text style={tableTitle}>{title}</Text>
      <table role="presentation" style={itemsTable}>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={itemCell}>
                {item.productName}
                <br />
                <span style={itemUnit}>
                  {`${isPriced(item) ? yen(item.unitPrice) : "価格要相談"} × ${item.quantity}`}
                </span>
              </td>
              <td style={itemAmount}>
                {isPriced(item)
                  ? yen(item.unitPrice * item.quantity)
                  : "要相談"}
              </td>
            </tr>
          ))}
          <tr>
            <td style={totalLabel}>
              {hasNegotiable ? "合計（価格要相談を除く）" : "合計"}
            </td>
            <td style={totalAmount}>{yen(total)}</td>
          </tr>
        </tbody>
      </table>
      {hasNegotiable && (
        <Text style={smallNote}>
          価格要相談の商品は、合計に含まれていません。
        </Text>
      )}
    </>
  );
}

/** 項目と値の表（ご契約の内容・返金の内訳など） */
export function SummaryTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <>
      <Text style={tableTitle}>{title}</Text>
      <table role="presentation" style={summaryTable}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={summaryLabel}>{row.label}</td>
              <td style={summaryValue}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** お知らせの枠。info は案内、warning は注意 */
export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <Section style={tone === "info" ? noticeInfo : noticeWarning}>
      <Text
        style={{
          ...noticeText,
          color:
            tone === "info" ? EMAIL_COLORS.infoText : EMAIL_COLORS.warningText,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={buttonWrapper}>
      <Button href={href} style={button}>
        {children}
      </Button>
    </Section>
  );
}

/** ボタンの後ろに添える小さい文 */
export function EmailNote({ children }: { children: string }) {
  return <Text style={note}>{withLineBreaks(children)}</Text>;
}

const eyebrowStyle = {
  margin: "0 0 6px",
  fontSize: "11px",
  letterSpacing: "0.16em",
  color: EMAIL_COLORS.accentText,
};
const titleStyle = {
  margin: "0 0 16px",
  fontFamily: EMAIL_FONTS.display,
  fontSize: "22px",
  fontWeight: 600,
  lineHeight: "1.5",
  color: EMAIL_COLORS.text,
};
const leadStyle = {
  margin: "0 0 20px",
  fontSize: "14px",
  lineHeight: "1.9",
  color: EMAIL_COLORS.textBody,
};
const progressTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
  margin: "0 0 20px",
};
const progressCell = {
  width: "25%",
  padding: "0 2px",
  verticalAlign: "top" as const,
  textAlign: "center" as const,
};
const progressBar = { height: "4px", borderRadius: "999px", fontSize: 0 };
const progressLabel = {
  marginTop: "6px",
  fontSize: "11px",
  color: EMAIL_COLORS.textMuted,
};
const progressLabelCurrent = {
  ...progressLabel,
  fontWeight: 700,
  color: EMAIL_COLORS.text,
};
const metaTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
  backgroundColor: EMAIL_COLORS.surfaceMuted,
  borderRadius: "8px",
  margin: "0 0 20px",
};
const metaCell = {
  padding: "14px 16px",
  fontSize: "12px",
  color: EMAIL_COLORS.textMuted,
};
const metaNumber = {
  fontSize: "17px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: EMAIL_COLORS.text,
  wordBreak: "break-all" as const,
};
const metaDate = { fontSize: "14px", color: EMAIL_COLORS.text };
const tableTitle = {
  margin: "0 0 8px",
  fontSize: "13px",
  fontWeight: 600,
  color: EMAIL_COLORS.text,
};
const itemsTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: "13px",
  margin: "0 0 8px",
};
const itemCell = {
  padding: "10px 0",
  borderBottom: `1px solid ${EMAIL_COLORS.canvas}`,
  color: EMAIL_COLORS.text,
  lineHeight: "1.6",
};
const itemUnit = { fontSize: "12px", color: EMAIL_COLORS.textMuted };
const itemAmount = {
  padding: "10px 0",
  borderBottom: `1px solid ${EMAIL_COLORS.canvas}`,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  fontWeight: 600,
  color: EMAIL_COLORS.text,
  verticalAlign: "top" as const,
};
const totalLabel = {
  padding: "12px 0 0",
  fontWeight: 600,
  color: EMAIL_COLORS.text,
};
const totalAmount = {
  padding: "12px 0 0",
  textAlign: "right" as const,
  fontSize: "17px",
  fontWeight: 700,
  color: EMAIL_COLORS.text,
};
const smallNote = {
  margin: "0 0 20px",
  fontSize: "12px",
  color: EMAIL_COLORS.textMuted,
};
const summaryTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: "13px",
  margin: "0 0 20px",
  border: `1px solid ${EMAIL_COLORS.border}`,
};
const summaryLabel = {
  padding: "10px 14px",
  borderBottom: `1px solid ${EMAIL_COLORS.canvas}`,
  color: EMAIL_COLORS.textMuted,
  width: "42%",
  verticalAlign: "top" as const,
};
const summaryValue = {
  padding: "10px 14px",
  borderBottom: `1px solid ${EMAIL_COLORS.canvas}`,
  color: EMAIL_COLORS.text,
  fontWeight: 600,
  lineHeight: "1.6",
};
const noticeBase = {
  margin: "0 0 20px",
  padding: "12px 14px",
  borderRadius: "8px",
};
const noticeInfo = {
  ...noticeBase,
  backgroundColor: EMAIL_COLORS.infoBackground,
  border: `1px solid ${EMAIL_COLORS.infoBorder}`,
};
const noticeWarning = {
  ...noticeBase,
  backgroundColor: EMAIL_COLORS.warningBackground,
  border: `1px solid ${EMAIL_COLORS.warningBorder}`,
};
const noticeText = { margin: 0, fontSize: "13px", lineHeight: "1.8" };
const buttonWrapper = { textAlign: "center" as const, margin: "24px 0 8px" };
const button = {
  display: "inline-block",
  padding: "14px 32px",
  borderRadius: "999px",
  backgroundColor: EMAIL_COLORS.buttonBackground,
  color: EMAIL_COLORS.buttonText,
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
};
const note = {
  margin: "16px 0 0",
  fontSize: "12px",
  lineHeight: "1.8",
  color: EMAIL_COLORS.textMuted,
};
