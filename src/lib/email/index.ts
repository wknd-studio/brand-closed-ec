import { Resend } from "resend";

let _resend: Resend | null = null;

// E2Eテスト実行時など、実際にメールを送信したくない環境ではResend APIを一切
// 呼び出さないダミークライアントを返す（Resendの送信数使用枠を消費しないため）。
// 全てのメール送信関数はgetResend().emails.send()経由でのみResendを呼ぶため、
// ここ一箇所のガードで全メール送信をまとめて無効化できる
function isEmailSendingDisabled(): boolean {
  return process.env.DISABLE_EMAIL_SENDING === "true";
}

function createNoopResend(): Resend {
  return {
    emails: {
      send: async () => ({ data: null, error: null }),
    },
  } as unknown as Resend;
}

export function getResend(): Resend {
  if (!_resend) {
    _resend = isEmailSendingDisabled()
      ? createNoopResend()
      : new Resend(process.env.RESEND_API_KEY!);
  }
  return _resend;
}
