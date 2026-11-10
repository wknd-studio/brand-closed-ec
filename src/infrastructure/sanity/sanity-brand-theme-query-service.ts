import { sanityClient } from "@/infrastructure/sanity/client";
import type {
  BrandThemeDto,
  BrandThemeQueryService,
} from "@/queries/brand-theme-query-service";

export class SanityBrandThemeQueryService implements BrandThemeQueryService {
  async findBrandTheme(brandName: string): Promise<BrandThemeDto | null> {
    return sanityClient.fetch<BrandThemeDto | null>(
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
}
