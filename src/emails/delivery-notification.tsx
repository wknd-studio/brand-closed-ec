import {
  Body,
  Button,
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
  myPageUrl: string;
};

export function DeliveryNotificationEmail({ orderId, myPageUrl }: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>配送完了のお知らせ - 注文番号: {orderId}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>配送完了のお知らせ</Heading>
          <Text style={text}>
            いつもご利用いただきありがとうございます。
            <br />
            ご注文の商品が配送完了となりました。お受け取りをご確認ください。
          </Text>

          <Section style={section}>
            <Text style={label}>注文番号</Text>
            <Text style={code}>{orderId}</Text>
          </Section>

          <Section style={{ ...section, textAlign: "center" }}>
            <Button style={button} href={myPageUrl}>
              注文状況を確認する
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>ご不明な点はお問い合わせください。</Text>
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
  borderBottom: "2px solid #333",
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
const button = {
  backgroundColor: "#333",
  color: "#fff",
  padding: "12px 24px",
  borderRadius: "4px",
  fontSize: "14px",
  textDecoration: "none",
};
const hr = { borderColor: "#eee", margin: "32px 0 16px" };
const footer = { fontSize: "12px", color: "#aaa" };
