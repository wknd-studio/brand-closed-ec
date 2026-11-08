import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  orderId: string;
};

export function LimitExceededMemberEmail({ orderId }: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>月次仕入れ上限超過のお知らせ - 注文番号: {orderId}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>月次仕入れ上限超過のお知らせ</Heading>
          <Text style={text}>
            いつもご利用いただきありがとうございます。
            <br />
            誠に恐れ入りますが、今月の仕入れ上限額を超過しているため、以下のご注文の請求書を発行できない状況です。
          </Text>

          <Section style={section}>
            <Text style={label}>注文番号</Text>
            <Text style={code}>{orderId}</Text>
          </Section>

          <Section style={section}>
            <Text style={text}>
              プランのアップグレードをご希望の場合、またはご不明な点がございましたら、お問い合わせください。
              <br />
              担当者よりご連絡いたします。
            </Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            このメールは自動送信されています。ご返信はお問い合わせフォームよりお願いします。
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#f5f5f5", fontFamily: "sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "600px",
};
const h1 = {
  fontSize: "20px",
  color: "#333",
  borderBottom: "2px solid #c53030",
  paddingBottom: "8px",
};
const text = { color: "#333", lineHeight: "1.6" };
const label = { fontWeight: "bold", color: "#333", marginBottom: "4px" };
const code = {
  fontFamily: "monospace",
  backgroundColor: "#f5f5f5",
  padding: "8px",
  borderRadius: "4px",
};
const section = { marginTop: "24px" };
const hr = { borderColor: "#eee", margin: "32px 0 16px" };
const footer = { fontSize: "12px", color: "#aaa" };
