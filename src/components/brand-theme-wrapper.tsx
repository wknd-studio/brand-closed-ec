import Image from "next/image";
import type { CSSProperties } from "react";
import type { BrandTheme } from "@/lib/sanity/brand-theme";
import { resolveBrandThemeCssVars } from "@/lib/brand-theme-style";

export default function BrandThemeWrapper({
  theme,
  children,
}: {
  theme: BrandTheme | null;
  children: React.ReactNode;
}) {
  const style = resolveBrandThemeCssVars(theme) as CSSProperties;

  return (
    <div style={style} className="font-brand">
      {theme?.bannerUrl && (
        <div className="relative mb-8 h-48 w-full overflow-hidden rounded-lg sm:h-64">
          <Image
            src={theme.bannerUrl}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        </div>
      )}
      {children}
    </div>
  );
}
