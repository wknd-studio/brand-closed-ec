// 明細の発送拠点（locations.code）。注文確定時点の商品の設定をスナップショットとして明細に残し、
// 入荷検品が要るか・出荷できる条件がこれで分かれる（docs/domain/fulfillment.md、#357）。
// 値は Sanity の商品スキーマの選択肢（src/sanity/schemas/fulfillment-location-options.ts）と揃える
export type FulfillmentLocationCode = "office" | "supplier_direct";
