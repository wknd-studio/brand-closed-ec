interface AddressSnapshotProps {
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
}

const REQUIRED_FIELDS: (keyof AddressSnapshotProps)[] = [
  "recipientLastName",
  "recipientFirstName",
  "postalCode",
  "prefecture",
  "city",
  "addressLine1",
  "phoneNumber",
];

export class AddressSnapshot {
  readonly recipientLastName: string;
  readonly recipientFirstName: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly phoneNumber: string;

  private constructor(props: AddressSnapshotProps) {
    this.recipientLastName = props.recipientLastName;
    this.recipientFirstName = props.recipientFirstName;
    this.postalCode = props.postalCode;
    this.prefecture = props.prefecture;
    this.city = props.city;
    this.addressLine1 = props.addressLine1;
    this.addressLine2 = props.addressLine2;
    this.phoneNumber = props.phoneNumber;
  }

  static of(props: AddressSnapshotProps): AddressSnapshot {
    for (const field of REQUIRED_FIELDS) {
      if (!props[field]) {
        throw new Error(`${field} は必須です`);
      }
    }
    return new AddressSnapshot(props);
  }

  toFullName(): string {
    return `${this.recipientLastName} ${this.recipientFirstName}`;
  }
}
