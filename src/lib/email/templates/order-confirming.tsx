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

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type Props = {
  orderId: string;
  lineItems: LineItem[];
};

export function OrderConfirmingEmail({ orderId, lineItems }: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>ご注文を受け付けました - 注文番号: {orderId}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>ご注文を受け付けました</Heading>
          <Text style={text}>
            この度はご注文いただきありがとうございます。
            <br />
            内容を確認の上、請求書をお送りいたします。しばらくお待ちください。
          </Text>

          <Section style={section}>
            <Text style={label}>注文番号</Text>
            <Text style={code}>{orderId}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>注文内容</Text>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>商品名</th>
                  <th style={{ ...th, textAlign: "center" }}>数量</th>
                  <th style={{ ...th, textAlign: "right" }}>単価</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i}>
                    <td style={td}>{item.productName}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {item.quantity}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {item.isNegotiable
                        ? "要相談"
                        : `¥${item.unitPrice?.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
const table = { width: "100%", borderCollapse: "collapse" as const };
const th = {
  padding: "8px",
  backgroundColor: "#f5f5f5",
  textAlign: "left" as const,
  color: "#333",
};
const td = {
  padding: "8px",
  borderBottom: "1px solid #eee",
  color: "#333",
};
const hr = { borderColor: "#eee", margin: "32px 0 16px" };
const footer = { fontSize: "12px", color: "#aaa" };
