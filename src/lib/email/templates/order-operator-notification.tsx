import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
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

type OrderOperatorNotificationEmailProps = {
  orderId: string;
  customerEmail: string;
  lineItems: LineItem[];
  adminOrderUrl: string;
};

export function OrderOperatorNotificationEmail({
  orderId,
  customerEmail,
  lineItems,
  adminOrderUrl,
}: OrderOperatorNotificationEmailProps) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>【新規注文】{customerEmail} より注文が入りました</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>新規Invoice注文が入りました</Heading>
          <Text style={text}>
            以下の注文を確認し、請求書を発行してください。
          </Text>

          <Section style={section}>
            <Text style={label}>注文番号</Text>
            <Text style={orderIdStyle}>{orderId}</Text>
          </Section>

          <Section style={section}>
            <Text style={label}>注文者</Text>
            <Text style={valueStyle}>{customerEmail}</Text>
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

          <Section style={{ marginTop: "24px" }}>
            <Link href={adminOrderUrl} style={button}>
              管理画面で注文を確認する
            </Link>
          </Section>
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

const valueStyle: React.CSSProperties = {
  fontSize: "14px",
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

const button: React.CSSProperties = {
  backgroundColor: "#333",
  color: "#fff",
  padding: "12px 24px",
  borderRadius: "4px",
  textDecoration: "none",
  fontSize: "14px",
};
