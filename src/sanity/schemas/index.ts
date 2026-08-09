import { announcement } from "./announcement";
import { brand } from "./brand";
import { category } from "./category";
import { csvCatalog } from "./csv-catalog";
import { designTheme } from "./design-theme";
import { priceSettings } from "./price-settings";
import { product } from "./product";
import { productImportRun } from "./product-import-run";

export const schemaTypes = [
  brand,
  category,
  product,
  priceSettings,
  designTheme,
  announcement,
  csvCatalog,
  productImportRun,
];
