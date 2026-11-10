// 商品画面（/shop/[brand]・/shop/[brand]/[id]）に適用するブランドのデザインテーマ
export type BrandThemeDto = {
  primaryColorHex: string;
  accentColorHex: string;
  font: string;
  bannerUrl: string;
};

export interface BrandThemeQueryService {
  // ブランドが存在しない・デザインテーマが未設定なら null
  findBrandTheme(brandName: string): Promise<BrandThemeDto | null>;
}
