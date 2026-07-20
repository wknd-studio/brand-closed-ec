# Stripe Price ID 対応表（T001）

`docs/archive/service-spec.md` の「料金・仕入れ上限」表に基づき、Stripeテストモードで作成したProduct/Price。ENTERPRISEは個別契約のためセルフサービス用のPriceは作成していない（FR-006）。

| ランク   | 月額費用 | Product ID            | 月額 Price ID                    | 初期費用 Price ID                |
| -------- | -------- | --------------------- | -------------------------------- | -------------------------------- |
| STARTER  | ¥5,000   | `prod_Uv2eRDiH8jLGuy` | `price_1TvCZQRtuHrwdqCghdX19duR` | `price_1TvCZQRtuHrwdqCgBy9WGMtt` |
| BASIC    | ¥10,000  | `prod_Uv2eNsg4puu5xe` | `price_1TvCZRRtuHrwdqCgBgpfo0S0` | `price_1TvCZSRtuHrwdqCgkG0qerlb` |
| STANDARD | ¥30,000  | `prod_Uv2era9Zi5xx55` | `price_1TvCZSRtuHrwdqCgbEbk8vLG` | `price_1TvCZTRtuHrwdqCgdHxhtnJR` |
| PRO      | ¥50,000  | `prod_Uv2eZZZMK1JjB5` | `price_1TvCZTRtuHrwdqCggROQ4lTs` | `price_1TvCZURtuHrwdqCgnGpfeRop` |
| ADVANCED | ¥110,000 | `prod_Uv2eUhJTP57CLa` | `price_1TvCZVRtuHrwdqCgl9mjSD6N` | `price_1TvCZVRtuHrwdqCgHnO7bN59` |
| PREMIUM  | ¥330,000 | `prod_Uv2eO3oSBYCFWg` | `price_1TvCZWRtuHrwdqCgbjyVqwaU` | `price_1TvCZWRtuHrwdqCgvjq0j9rG` |

## 環境変数

`.env.local`（テストモード）に以下を設定済み。本番作成時は同じ手順でStripe本番モードのProduct/Priceを作成し、`.env.prod`（Cloudflareのシークレット経由）に設定する。

```
STRIPE_PRICE_ID_STARTER=
STRIPE_PRICE_ID_STARTER_INITIAL_FEE=
STRIPE_PRICE_ID_BASIC=
STRIPE_PRICE_ID_BASIC_INITIAL_FEE=
STRIPE_PRICE_ID_STANDARD=
STRIPE_PRICE_ID_STANDARD_INITIAL_FEE=
STRIPE_PRICE_ID_PRO=
STRIPE_PRICE_ID_PRO_INITIAL_FEE=
STRIPE_PRICE_ID_ADVANCED=
STRIPE_PRICE_ID_ADVANCED_INITIAL_FEE=
STRIPE_PRICE_ID_PREMIUM=
STRIPE_PRICE_ID_PREMIUM_INITIAL_FEE=
```

**完了**: T009にて`src/lib/stripe.ts`のコードを新変数に切り替え、旧変数（`STRIPE_PRICE_ID_ENTRY` / 旧`STRIPE_PRICE_ID_STANDARD` / 旧`STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_INITIAL_FEE`）は削除済み。新STANDARD・新PROのPrice IDは`STRIPE_PRICE_ID_STANDARD`・`STRIPE_PRICE_ID_PRO`としてそのまま設定している（一時的な`_NEW`サフィックスは使用していない）。
