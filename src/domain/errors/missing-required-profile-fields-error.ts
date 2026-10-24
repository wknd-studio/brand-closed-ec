import { DomainError } from "./domain-error";

export type RequiredProfileField =
  | "lastName"
  | "firstName"
  | "phoneNumber"
  | "companyName"
  | "invoiceRegistrationNumber";

// 氏名・電話番号（法人は会社名・インボイス番号も）は必須。HTMLのrequiredは外して送信できるうえ
// 空白だけの入力も通すため、サーバー側で前後の空白を除いて判定する
export class MissingRequiredProfileFieldsError extends DomainError {
  constructor(readonly fields: readonly RequiredProfileField[]) {
    super(`必須項目が入力されていません: ${fields.join(", ")}`);
  }
}
