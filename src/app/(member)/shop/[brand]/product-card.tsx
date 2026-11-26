import type { ProductCardDto } from "@/queries/catalog-query-service";
import FavoriteButton from "@/components/favorite-button";
import { ProductCard } from "@/components/ui/product-card";

export default function ShopProductCard({
  product,
}: {
  product: ProductCardDto;
}) {
  return (
    <ProductCard
      href={`/shop/${encodeURIComponent(product.brand)}/${product.id}`}
      name={product.name}
      imageUrl={product.thumbnail}
      retailPrice={product.retailPrice}
      unitPrice={product.unitPrice}
      isNegotiable={product.isNegotiable}
      isOutOfStock={product.availability === "out_of_stock"}
      isInvoicePayment={product.paymentTiming === "after_order"}
      favorite={<FavoriteButton sanityProductId={product.id} />}
    />
  );
}
