import { SanityCatalogQueryService } from "@/infrastructure/sanity/sanity-catalog-query-service";
import type { CatalogQueryService } from "@/queries/catalog-query-service";

export function catalogQueryService(): CatalogQueryService {
  return new SanityCatalogQueryService();
}
