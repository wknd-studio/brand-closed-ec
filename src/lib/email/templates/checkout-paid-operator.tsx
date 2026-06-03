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

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type Props = {
  orderId: string;
  customerEmail: string;
  lineItems: LineItem[];
  adminOrderUrl: string;
};

export function CheckoutPaidOperatorEmail({
  orderId,
  customerEmail,
  lineItems,
  adminOrderUrl,
}: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>入金確認 - {customerEmail} より注文の入金がありました</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>入金確認・手配依頼</Heading>
          <Text style={text}>
            以下の注文の入金を確認しました。商品の手配を開始してください。
          </Text>

          <Section style={section}>
            <Text style={label}>注文番号</Text>
            <Text style={code}>{orderId}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>注文者</Text>
            <Text style={text}>{customerEmail}</Text>
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

          <Section style={{ ...section, textAlign: "center" }}>
            <Button style={button} href={adminOrderUrl}>
              管理画面で注文を確認する
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>このメールは自動送信されています。</Text>
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
const td = { padding: "8px", borderBottom: "1px solid #eee", color: "#333" };
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
