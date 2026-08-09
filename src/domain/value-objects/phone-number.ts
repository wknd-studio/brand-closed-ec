import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";

const PHONE_NUMBER_PATTERN = /^0\d{9,10}$/;

export class PhoneNumber {
  private constructor(readonly value: string) {}

  static of(rawValue: string): PhoneNumber {
    const normalized = rawValue.replaceAll("-", "");
    if (!PHONE_NUMBER_PATTERN.test(normalized)) {
      throw new InvalidPhoneNumberError(rawValue);
    }
    return new PhoneNumber(normalized);
  }

  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }
}
