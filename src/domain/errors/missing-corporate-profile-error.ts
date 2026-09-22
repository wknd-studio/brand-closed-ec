import { DomainError } from "./domain-error";

// GitHub issue #200: member_type='corporate'の場合、company_name/
// invoice_registration_numberの両方が必須（DB側のCHECK制約と対称のルール）
export class MissingCorporateProfileError extends DomainError {
  constructor() {
    super("法人会員には会社名と適格請求書発行事業者登録番号の両方が必要です");
  }
}
