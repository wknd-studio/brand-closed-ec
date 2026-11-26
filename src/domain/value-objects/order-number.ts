import { InvalidOrderNumberError } from "@/domain/errors/invalid-order-number-error";

// 注文番号（#754）。Crockford Base32（0-9 と I・L・O・U を除く英大文字。値 0〜31 の順）の8文字（40ビット）。
// 連番にしないのは、番号の差から注文件数が会員に分かるため（#753）。保存する形はハイフン無し
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ORDER_NUMBER_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const RANDOM_BYTES_LENGTH = 5;
// 書き写した番号の揺れ（#755）。区切り（ハイフン・空白）は捨て、番号に使わない O・I・L は形の似た数字として読む
const SEPARATORS = /[\s-]/g;
const MISREAD_CHARACTERS: Record<string, string> = { O: "0", I: "1", L: "1" };

export class OrderNumber {
  private constructor(readonly value: string) {}

  static of(rawValue: string): OrderNumber {
    if (!ORDER_NUMBER_PATTERN.test(rawValue)) {
      throw new InvalidOrderNumberError(rawValue);
    }
    return new OrderNumber(rawValue);
  }

  /**
   * 会員・運営者が入力した番号を読む。小文字・ハイフンや空白の有無・O と 0・I/L と 1 の違いを吸収し、
   * 揺れを除いても番号の形にならなければ InvalidOrderNumberError（入力された値のまま持つ）
   */
  static parse(input: string): OrderNumber {
    const normalized = input
      .replace(SEPARATORS, "")
      .toUpperCase()
      .replace(/[OIL]/g, (c) => MISREAD_CHARACTERS[c]);
    if (!ORDER_NUMBER_PATTERN.test(normalized)) {
      throw new InvalidOrderNumberError(input);
    }
    return new OrderNumber(normalized);
  }

  /**
   * 乱数の5バイト（40ビット）を5ビットずつ8文字にして番号を作る。何バイト要るかは番号の形の決まりなので
   * ここで決め、乱数源（長さを受け取って乱数を返す）だけを呼び出し側が渡す（注文のIDと同じく、domain は
   * 乱数の作り方を持たない）。重なりは DB の UNIQUE が防ぐ
   */
  static generate(randomBytes: (length: number) => Uint8Array): OrderNumber {
    const bytes = randomBytes(RANDOM_BYTES_LENGTH);
    if (bytes.length !== RANDOM_BYTES_LENGTH) {
      throw new RangeError(
        `注文番号には${RANDOM_BYTES_LENGTH}バイトの乱数が要ります: ${bytes.length}バイト`
      );
    }
    // 40ビットは Number で正確に扱える（2^53 未満）。ビット演算は32ビットに切り詰めるため使わない
    let bits = 0;
    for (const byte of bytes) {
      bits = bits * 256 + byte;
    }
    let value = "";
    for (let i = 7; i >= 0; i--) {
      value += ALPHABET[Math.floor(bits / 32 ** i) % 32];
    }
    return new OrderNumber(value);
  }

  // 画面・メールに出す形。読み上げ・書き写しやすいよう4文字ずつハイフンで区切る（例: K7Q2-M9XD）
  display(): string {
    return `${this.value.slice(0, 4)}-${this.value.slice(4)}`;
  }

  equals(other: OrderNumber): boolean {
    return this.value === other.value;
  }
}
