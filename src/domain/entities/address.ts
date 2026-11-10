import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";

export type AddressType = "shipping" | "billing" | "headquarters";

/** 会員が書き換えられる住所の内容（宛名・住所・電話番号） */
export interface AddressContent {
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
}

interface AddressProps extends AddressContent {
  id: string;
  type: AddressType;
  isDefault: boolean;
}

// 復元の入口（reconstituteAddress）から private コンストラクタを使うため、static ブロックで受け取る
let construct: (props: AddressProps) => Address;

export class Address {
  static {
    construct = (props) => new Address(props);
  }

  readonly id: string;
  readonly type: AddressType;
  readonly isDefault: boolean;
  readonly recipientLastName: string;
  readonly recipientFirstName: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly phoneNumber: string;

  private constructor(props: AddressProps) {
    this.id = props.id;
    this.type = props.type;
    this.isDefault = props.isDefault;
    this.recipientLastName = props.recipientLastName;
    this.recipientFirstName = props.recipientFirstName;
    this.postalCode = props.postalCode;
    this.prefecture = props.prefecture;
    this.city = props.city;
    this.addressLine1 = props.addressLine1;
    this.addressLine2 = props.addressLine2;
    this.phoneNumber = props.phoneNumber;
  }

  /** 新しい住所を作る。同じ種別の最初の住所は既定の住所にする */
  static create(params: {
    id: string;
    type: AddressType;
    content: AddressContent;
    isFirstOfType: boolean;
  }): Address {
    const { content } = params;
    // 構造的部分型でより広いオブジェクトが渡されても、既定かどうかを上書きしないよう項目を取り出す
    return new Address({
      id: params.id,
      type: params.type,
      isDefault: params.isFirstOfType,
      recipientLastName: content.recipientLastName,
      recipientFirstName: content.recipientFirstName,
      postalCode: content.postalCode,
      prefecture: content.prefecture,
      city: content.city,
      addressLine1: content.addressLine1,
      addressLine2: content.addressLine2,
      phoneNumber: content.phoneNumber,
    });
  }

  private with(overrides: Partial<AddressProps>): Address {
    return new Address({
      id: this.id,
      type: this.type,
      isDefault: this.isDefault,
      recipientLastName: this.recipientLastName,
      recipientFirstName: this.recipientFirstName,
      postalCode: this.postalCode,
      prefecture: this.prefecture,
      city: this.city,
      addressLine1: this.addressLine1,
      addressLine2: this.addressLine2,
      phoneNumber: this.phoneNumber,
      ...overrides,
    });
  }

  /** 住所の内容を書き換える。ID・種別・既定かどうかは変えない */
  update(content: AddressContent): Address {
    // 構造的部分型でより広いオブジェクトが渡されても、ID・種別・既定を上書きしないよう項目を取り出す
    return this.with({
      recipientLastName: content.recipientLastName,
      recipientFirstName: content.recipientFirstName,
      postalCode: content.postalCode,
      prefecture: content.prefecture,
      city: content.city,
      addressLine1: content.addressLine1,
      addressLine2: content.addressLine2,
      phoneNumber: content.phoneNumber,
    });
  }

  /** 既定の住所にする。同じ種別の他の住所の既定の解除はリポジトリ側（clearDefault）で行う */
  makeDefault(): Address {
    return this.with({ isDefault: true });
  }

  toSnapshot(): AddressSnapshot {
    return AddressSnapshot.of({
      recipientLastName: this.recipientLastName,
      recipientFirstName: this.recipientFirstName,
      postalCode: this.postalCode,
      prefecture: this.prefecture,
      city: this.city,
      addressLine1: this.addressLine1,
      addressLine2: this.addressLine2,
      phoneNumber: this.phoneNumber,
    });
  }
}

/**
 * DBの行からの復元とテストの組み立てにだけ使う（src/infrastructure・src/domain の外からの import は lint で禁止。#635）。
 * 新規作成は Address.create()、書き換えは update()・makeDefault() を使う
 */
export function reconstituteAddress(props: AddressProps): Address {
  return construct(props);
}
