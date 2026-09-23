export const MEMBER_TYPES = ["individual", "corporate"] as const;

export type MemberTypeValue = (typeof MEMBER_TYPES)[number];

export class MemberType {
  private constructor(readonly value: MemberTypeValue) {}

  static of(value: string): MemberType {
    if (!(MEMBER_TYPES as readonly string[]).includes(value)) {
      throw new Error(`不正なmember_type値: ${value}`);
    }
    return new MemberType(value as MemberTypeValue);
  }

  isCorporate(): boolean {
    return this.value === "corporate";
  }

  equals(other: MemberType): boolean {
    return this.value === other.value;
  }
}
