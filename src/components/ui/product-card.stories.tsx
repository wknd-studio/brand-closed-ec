import type { Meta, StoryObj } from "@storybook/nextjs";
import FavoriteButton from "@/components/favorite-button";
import { FavoritesProvider } from "@/components/favorites/favorites-provider";
import { ProductCard } from "./product-card";

const meta = {
  title: "UI/ProductCard",
  component: ProductCard,
  args: {
    href: "/shop/Brand%20A/prod-1",
    name: "レザートートバッグ",
    imageUrl: "/hero-products.png",
    retailPrice: 48000,
    unitPrice: 31200,
    isNegotiable: false,
  },
  decorators: [
    (Story) => (
      <FavoritesProvider
        initialFavoriteIds={["prod-1"]}
        addFavorite={async () => {}}
        removeFavorite={async () => {}}
      >
        <div className="w-[260px]">
          <Story />
        </div>
      </FavoritesProvider>
    ),
  ],
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// お気に入りのハートは画像の右上（押すと切り替わる）
export const WithFavorite: Story = {
  args: { favorite: <FavoriteButton sanityProductId="prod-1" /> },
};

export const NoImage: Story = {
  args: {
    imageUrl: null,
    favorite: <FavoriteButton sanityProductId="prod-2" />,
  },
};

export const Negotiable: Story = {
  args: { isNegotiable: true, unitPrice: null, isInvoicePayment: true },
};

export const InvoicePayment: Story = {
  args: { isInvoicePayment: true },
};

export const OutOfStock: Story = {
  args: { isOutOfStock: true },
};

// 商品名が長いときは2行で切る
export const LongName: Story = {
  args: {
    name: "コットンオックスフォードシャツ レギュラーカラー ロングスリーブ（ホワイト）",
  },
};
