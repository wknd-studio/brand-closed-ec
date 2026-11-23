// 商品の発送拠点（#356）。値は DB の locations.code と一致させる。
// locations の初期データは supabase/migrations/20261123072013_create_locations.sql（#354）。
// 拠点を増やすときは、ここと locations の両方に足す
export const FULFILLMENT_LOCATION_OPTIONS = [
  { title: "事務所経由", value: "office" },
  { title: "仕入れ先直送", value: "supplier_direct" },
] as const;

export type FulfillmentLocationCode =
  (typeof FULFILLMENT_LOCATION_OPTIONS)[number]["value"];

export const DEFAULT_FULFILLMENT_LOCATION: FulfillmentLocationCode = "office";
