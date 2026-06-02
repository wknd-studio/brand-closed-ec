import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type OrderConfirmingEmailProps = {
  orderId: string;
  lineItems: LineItem[];
};

export function OrderConfirmingEmail({
  orderId,
  lineItems,
}: OrderConfirmingEmailProps) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>ご注文を受け付けました（注文番号: {orderId}）</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>ご注文を受け付けました</Heading>
          <Text style={text}>
            この度はご注文いただきありがとうございます。
            <br />
            内容を確認の上、請求書をお送りいたします。しばらくお待ちください。
          </Text>

          <Section style={section}>
            <Text style={label}>注文番号</Text>
            <Text style={orderIdStyle}>{orderId}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>注文内容</Text>
            <Section style={table}>
              <Row style={tableHeader}>
                <Text style={{ ...tableCell, fontWeight: "bold", flex: 3 }}>
                  商品名
                </Text>
                <Text
                  style={{
                    ...tableCell,
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                >
                  数量
                </Text>
                <Text
                  style={{
                    ...tableCell,
                    fontWeight: "bold",
                    textAlign: "right",
                  }}
                >
                  単価
                </Text>
              </Row>
              {lineItems.map((item, i) => (
                <Row key={i} style={tableRow}>
                  <Text style={{ ...tableCell, flex: 3 }}>
                    {item.productName}
                  </Text>
                  <Text style={{ ...tableCell, textAlign: "center" }}>
                    {item.quantity}
                  </Text>
                  <Text style={{ ...tableCell, textAlign: "right" }}>
                    {item.isNegotiable
                      ? "要相談"
                      : `¥${item.unitPrice?.toLocaleString()}`}
                  </Text>
                </Row>
              ))}
            </Section>
          </Section>

          <Text style={footer}>ご不明な点はお問い合わせください。</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f9f9f9",
  fontFamily: "sans-serif",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "600px",
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  borderBottom: "2px solid #333",
  paddingBottom: "8px",
  color: "#333",
};

const text: React.CSSProperties = {
  fontSize: "14px",
  color: "#444",
  lineHeight: "1.6",
};

const section: React.CSSProperties = {
  marginTop: "24px",
};

const label: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "bold",
  color: "#888",
  marginBottom: "4px",
  textTransform: "uppercase",
};

const orderIdStyle: React.CSSProperties = {
  fontFamily: "monospace",
  backgroundColor: "#f5f5f5",
  padding: "8px",
  borderRadius: "4px",
  fontSize: "13px",
  color: "#333",
};

const table: React.CSSProperties = {
  width: "100%",
};

const tableHeader: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  display: "flex",
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  display: "flex",
};

const tableCell: React.CSSProperties = {
  padding: "8px",
  fontSize: "13px",
  color: "#444",
  flex: 1,
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#aaa",
  marginTop: "32px",
};
