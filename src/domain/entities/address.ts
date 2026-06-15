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

  private readonly props: AddressProps;

  private constructor(props: AddressProps) {
    this.id = props.id;
    this.type = props.type;
    this.isDefault = props.isDefault;
    this.props = props;
  }

  static of(props: AddressProps): Address {
    return new Address(props);
  }

  toSnapshot(): AddressSnapshot {
    return AddressSnapshot.of({
      recipientLastName: this.props.recipientLastName,
      recipientFirstName: this.props.recipientFirstName,
      postalCode: this.props.postalCode,
      prefecture: this.props.prefecture,
      city: this.props.city,
      addressLine1: this.props.addressLine1,
      addressLine2: this.props.addressLine2,
      phoneNumber: this.props.phoneNumber,
    });
  }
}
