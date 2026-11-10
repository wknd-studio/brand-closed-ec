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
};

// お気に入り画面（/favorites）。商品の表示制限はランクで判定する
export type FavoritesDto = {
  rank: MemberRank;
  favoriteProductIds: string[];
};

// 会員の画面の共通レイアウト（カートの今月の確定額・上限、お気に入りの初期状態）
export type MemberLayoutDto = {
  confirmedAmount: number;
  monthlyLimit: number;
  favoriteProductIds: string[];
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
  // 決済完了画面の Stripe Customer。未作成・退会済み・存在しない会員は null
  findStripeCustomerId(clerkUserId: string): Promise<string | null>;
}
