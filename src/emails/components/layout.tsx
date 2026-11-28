import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import {
  CONTACT,
  LEGAL_LINKS,
  legalNoticePlainText,
} from "@/app/legal/legal-notice";
import { EMAIL_COLORS, EMAIL_FONTS, appUrl } from "./theme";

type Props = {
  preview: string;
  children: ReactNode;
};

/** 会員向けメールの外枠。ロゴのヘッダー・送信専用の案内と問い合わせ先・規約へのリンクのフッター */
export function MemberEmailLayout({ preview, children }: Props) {
  return (
    <Html lang="ja">
      <Head>
        {/* ダークモードで色を反転させるメールソフトに、ライト表示の前提であることを伝える */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={appUrl("/logo.png")}
              alt="EQ×Mart"
              width="140"
              style={logo}
            />
          </Section>
          <Section style={main}>{children}</Section>
          <Section style={footer}>
            <Text style={footerText}>
              このメールは送信専用です。ご返信いただいてもお答えできません。
              <br />
              お問い合わせ: {legalNoticePlainText(CONTACT.email)}・
              {legalNoticePlainText(CONTACT.phone)}
              <br />
              {LEGAL_LINKS.map((link, i) => (
                <span key={link.href}>
                  {i > 0 && "　"}
                  <Link href={appUrl(link.href)} style={footerLink}>
                    {link.label}
                  </Link>
                </span>
              ))}
              <br />© EQ×Mart
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: EMAIL_COLORS.canvas,
  fontFamily: EMAIL_FONTS.sans,
  color: EMAIL_COLORS.text,
  margin: 0,
  padding: "32px 8px 40px",
};
const container = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: EMAIL_COLORS.surface,
  border: `1px solid ${EMAIL_COLORS.border}`,
  borderRadius: "12px",
  overflow: "hidden",
};
const header = {
  padding: "24px 32px 20px",
  textAlign: "center" as const,
  borderBottom: `2px solid ${EMAIL_COLORS.accent}`,
};
const logo = { width: "140px", height: "auto", margin: "0 auto" };
const main = { padding: "32px 28px 36px" };
const footer = {
  backgroundColor: EMAIL_COLORS.surfaceMuted,
  borderTop: `1px solid ${EMAIL_COLORS.border}`,
  padding: "20px 28px",
};
const footerText = {
  margin: 0,
  fontSize: "11px",
  lineHeight: "1.9",
  color: EMAIL_COLORS.textMuted,
};
const footerLink = { color: EMAIL_COLORS.textMuted };
