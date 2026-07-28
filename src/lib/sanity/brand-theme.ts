import { sanityClient } from "./client";

export type BrandTheme = {
  primaryColorHex: string;
  accentColorHex: string;
  font: string;
  bannerUrl: string;
};

export async function fetchBrandTheme(
  brandName: string
): Promise<BrandTheme | null> {
  return sanityClient.fetch<BrandTheme | null>(
    `*[_type=="brand"&&name==$brandName][0]{
      "theme": design_theme->{
        "primaryColorHex": primary_color.hex,
        "accentColorHex": accent_color.hex,
        font,
        "bannerUrl": banner.asset->url
      }
    }.theme`,
    { brandName }
  );
}
