import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";

export type AddressType = "shipping" | "billing";

interface AddressProps {
  id: string;
  type: AddressType;
  isDefault: boolean;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
}

export class Address {
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

  static of(props: AddressProps): Address {
    return new Address(props);
  }

  with(overrides: Partial<AddressProps>): Address {
    return Address.of({
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
