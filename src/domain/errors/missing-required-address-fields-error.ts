import { DomainError } from "./domain-error";
import type { AddressContent } from "@/domain/entities/address";

export type RequiredAddressField = Exclude<
  keyof AddressContent,
  "addressLine2"
>;

// 住所は宛名（姓・名）・郵便番号・都道府県・市区町村・番地・電話番号が必須。HTMLのrequiredは外して送信できるうえ
// 空白だけの入力も通すため、ドメインで前後の空白を除いて判定する
export class MissingRequiredAddressFieldsError extends DomainError {
  constructor(readonly fields: readonly RequiredAddressField[]) {
    super(`住所の必須項目が入力されていません: ${fields.join(", ")}`);
  }
}
