import type { MemberRank } from "@/domain/value-objects/member-rank";

// アカウント設定画面で編集する住所
export type SettingsAddressDto = {
  id: string;
  type: string;
  isDefault: boolean;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
};

// アカウント設定画面（/settings）。住所は既定の住所が先
export type SettingsDto = {
  addresses: SettingsAddressDto[];
  // 入会から6ヶ月の最低利用期間内なら、退会できるようになる日時（ISO文字列）。期間を過ぎていれば null
  withdrawableFrom: string | null;
  // ご契約の欄。プラン名は member_ranks.display_name_ja、月間仕入れ上限は null なら無制限
  plan: {
    name: string;
    monthlyLimit: number | null;
    // 今月の集計期間（ISO文字列）。end は含まない。仕入れ枠の集計と同じ請求日から出す
    period: { start: string; end: string };
  };
};

// お気に入り画面（/favorites）。商品の表示制限はランクで判定する
export type FavoritesDto = {
  rank: MemberRank;
  favoriteProductIds: string[];
};

// ヘッダーのアカウントのメニューに出す会員の情報
export type MemberAccountDto = {
  // 姓 名
  name: string;
  email: string;
  // プランの表示名（member_ranks.display_name_ja）
  planName: string;
};

// 会員の画面の共通レイアウト（カートの今月の確定額・上限、お気に入りの初期状態、支払い失敗中の案内、ヘッダーのアカウント）
export type MemberLayoutDto = {
  confirmedAmount: number;
  // 月間仕入れ上限。null なら無制限
  monthlyLimit: number | null;
  favoriteProductIds: string[];
  // 月額費用の支払い失敗中なら true（カードの更新を案内する。#379）
  paymentFailing: boolean;
  account: MemberAccountDto;
};

// 会員の画面の読み取り。他の会員のデータを返さないよう、どのメソッドも会員（clerkUserId）を必須にする
export interface MemberQueryService {
  // 退会済み・存在しない会員は null
  findSettings(clerkUserId: string): Promise<SettingsDto | null>;
  // 退会済み・存在しない会員は null。お気に入りは新しく登録した順
  findFavorites(clerkUserId: string): Promise<FavoritesDto | null>;
  // 退会済み・存在しない会員は null。確定額は注文確定時の上限チェックと同じ集計
  findMemberLayout(clerkUserId: string): Promise<MemberLayoutDto | null>;
  // 決済完了画面の入会の確定。退会済み・存在しない会員は false
  findOnboardingCompleted(clerkUserId: string): Promise<boolean>;
  // 決済完了画面・アカウント設定画面（お支払い方法の変更の表示）の Stripe Customer。未作成・退会済み・存在しない会員は null
  findStripeCustomerId(clerkUserId: string): Promise<string | null>;
  // 商品画面の価格を決めるランク。退会済み・存在しない会員は null
  findMemberRank(clerkUserId: string): Promise<MemberRank | null>;
}
