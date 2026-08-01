# Research: 商品別支払いタイミング設定とカート分割注文

**Feature**: 004-split-order-payment-timing
**Date**: 2026-07-31

spec.mdに[NEEDS CLARIFICATION]マーカーは残っていない（実装前の対話でユーザーと解消済み）。本ドキュメントは、その決定事項の根拠と、既存コードベースの調査に基づく技術的な裏付けを記録する。

## 決定1: `payment_timing`は商品(Sanity `product`)に持たせ、`is_negotiable`とは独立したフィールドとする

**Decision**: 既存の`is_negotiable`（価格未確定フラグ）をリネームして流用するのではなく、新規フィールド`payment_timing: "at_order" | "after_order"`を追加する。

**Rationale**:

- `is_negotiable`は「価格が確定しているか」、`payment_timing`は「いつ支払うか」という独立した軸である。ユーザー提示の例（固定価格の家電を後払いにしたい）は、既存の`is_negotiable`だけでは表現できない
- `is_negotiable=true`の商品は常に`payment_timing=after_order`に強制する（価格が決まっていないためCheckoutで即時決済できない）。この制約はSanityスキーマのカスタムバリデーション（`is_negotiable`と`payment_timing`の組み合わせをチェック）で担保する。パターンは既存の`src/sanity/schemas/product.ts`の`validatePrices`（`prices`と`is_negotiable`の整合性チェック）と同じ実装方針が使える

**Alternatives considered**:

- `is_negotiable`をリネームして両方の意味を持たせる案 → 家電（固定価格・後払い）のケースを表現できず却下

## 決定2: 支払いタイミングの分岐は「注文単位」ではなく「商品単位」の分割として実装する

**Decision**: `src/domain/services/order-flow-selector.ts`の`selectOrderFlow(cartItems): PaymentFlow`（カート全体に対して単一のフローを返す）を、カートを`payment_timing`で2グループに分割する関数に置き換える。

**Rationale**:

- 既存の`Order`集約は`paymentFlow: "checkout" | "invoice"`を注文1件につき1つ持つ設計（`src/domain/entities/order.ts:7,27`）。これは変更しない
- カートが混在する場合は、既存の`Order`集約をそのまま2件作成することで対応でき、`Order`自体のモデルを変更する必要がない（既存の`paymentFlow`のセマンティクスは維持される）
- 既存の「カート内が単一タイミング」のケース（今の全商品checkout/全商品invoiceケース）は、分割関数が「一方のグループが空」という結果を返すだけなので、後続処理を分岐させずに済み、後方互換が自然に保たれる

**Alternatives considered**:

- 単一Orderに複数`paymentFlow`を持たせる（Orderの中でアイテムごとに支払い方法を変える） → Stripe CheckoutとStripe Invoiceは支払いメカニズムとして併存できないため、Order集約の整合性が崩れる。却下

## 決定3: 分割された2件のOrderは`split_group_id`（nullable UUID）で関連付ける

**Decision**: Supabaseの`orders`テーブルに`split_group_id UUID`（nullable）列を追加する。分割が発生した場合のみ、両方のOrderに同一の値（`crypto.randomUUID()`で生成、`place-order.ts`で既に`orderId = crypto.randomUUID()`として同様の生成が行われている）をセットする。分割が発生しない場合（既存の単一Orderケース）は`null`のままとする。

**Rationale**:

- 既存の`orders`テーブルの列定義パターン（`supabase/migrations/20260516160953_initial_schema.sql:146-159`）に倣い、シンプルなnullable列として追加する。既存の`stripe_checkout_session_id`/`stripe_invoice_id`も同様にnullableな追加情報として設計されており、一貫性がある
- `null`許容にすることで、既存の全注文データ（本機能導入前に作成された注文）に対するマイグレーション不要で後方互換を保てる

**Alternatives considered**:

- 別テーブル（`order_groups`）を新設し外部キーで持たせる → 現時点でグループに付随する追加情報（グループ全体のステータス等）は要件にないため、オーバーエンジニアリングと判断し却下。将来グループ単位の情報が必要になった場合に追加すればよい

## 決定4: 月次上限チェックは分割前のカート合計に対して一度だけ行う

**Decision**: `place-order.ts`内の既存の`checkMonthlyLimit(user, cartItems, confirmedAmount)`呼び出しを、カート分割の**前**に、分割前の全`cartItems`（価格確定商品のみ、価格未確定商品は現状と同じく0円扱い）に対して実行する。チェックを通過した後にのみ、カートを2グループに分割してOrderを作成する。

**Rationale**:

- 既存の`checkMonthlyLimit`（`src/domain/services/monthly-limit-service.ts`、`place-order.ts:78`で呼び出し）は既に「価格確定商品のみの合計」で判定するロジックになっている（価格未確定商品の`unitPrice`は`Money.zero()`）。分割の有無に関わらずこのロジックをそのまま使い回せるため、追加の実装は「呼び出しタイミングを分割より前にする」だけで済む
- 上限超過時に例外（`LimitExceededError`）を投げる既存の仕組み（`place-order.ts`）をそのまま使えば、例外発生時点でOrder作成（`orderRepo.save`）自体がまだ行われていないため、「両方ブロックする」という要件が自然に満たされる

**Alternatives considered**:

- 分割後の各グループに対して個別に上限チェックを行う → 合計が上限を超えていても、チェックのタイミングによっては片方だけ通ってしまう可能性があり、要件（両方ブロック）を満たせないため却下

## 決定5: 固定価格商品を含む「注文後払い」グループのInvoice発行フローは、既存の`issue-invoice.ts`をそのまま使う

**Decision**: `after_order`グループのOrderは、価格未確定商品の有無に関わらず、既存の`confirming`ステータス→運営者による内容確認→`issueInvoice`ユースケースでの手動発行、という既存フローを変更せずに使う。

**Rationale**:

- `src/infrastructure/stripe/stripe-payment-gateway.ts:54`の`createInvoiceForOrder`は既に`item.negotiatedUnitPrice ?? item.unitPriceSnapshot`というフォールバックで実装されており、価格未確定商品は運営者が入力した`negotiatedUnitPrice`を、固定価格商品は最初から入っている`unitPriceSnapshot`を、どちらも同じロジックで請求書アイテムに変換できる。追加改修が不要
- `src/use-cases/issue-invoice.ts`の`negotiableItems`（運営者が価格入力すべき対象の絞り込み）は`isNegotiable`でフィルタしているため、固定価格商品はそもそもこのフィルタの対象外であり、既存のロジックのまま正しく動く

**Alternatives considered**:

- 固定価格商品のみのOrderは運営者確認を省略し自動発行する → ユーザーとの合意で明示的に却下（「今まで通り運営者の確認・手動発行を経る」）

## 決定6: `is_negotiable=true`の商品はランク別価格の入力欄をSanity Studio上で非表示にする

**Decision**: `src/sanity/schemas/product.ts`の`price_rates`・`prices`フィールドに、`hidden: ({ document }) => document?.is_negotiable === true`を追加する。

**Rationale**:

- 既存の実装（`place-order.ts`）は`product?.isNegotiable ? Money.zero() : product.unitPrice`という判定で、`is_negotiable=true`の場合は`prices`の値に関わらず常に0円扱いにする。つまり`is_negotiable=true`の商品に価格を入力すること自体は現状のスキーマ上可能だが、その入力値は購入フローで一切使われない
- 「入力できるのに使われない」状態は運営者を混乱させる（誤って設定した金額が実際には適用されないことに気づきにくい）。フィールド自体を非表示にすることで、この混乱を構造的に防ぐ
- Sanityの`hidden`は`document`の他フィールドの値を参照する条件付き表示に標準対応しており、`validatePrices`の条件分岐（`document?.is_negotiable`）と同じ判定式を使い回せる

**Alternatives considered**:

- 表示したまま`readOnly`にする → 「なぜ触れないのか」が伝わらず、混乱の解消にならないため却下
- 何もしない（現状維持） → 今回`payment_timing`を追加し`is_negotiable`の役割をより明確に説明する機会に合わせて、UX上の紛らわしさも一緒に解消する方が一貫性がある

## 決定7: カートのクッキー保存型(`src/lib/cart/types.ts`)に`paymentTiming`を追加し、カート画面で商品をグループ表示する

**Decision**: 会員向けカート(`src/lib/cart/types.ts`の`CartItem`、Cookieに保存されクライアント側`cart-sidebar.tsx`等で参照される)に`paymentTiming: "at_order" | "after_order"`を追加する。カートに両方のタイミングの商品が混在する場合、`cart-sidebar.tsx`・チェックアウト画面で商品リストを2グループ（「注文時に支払う商品」/「注文後に請求される商品」）に分けて表示し、それぞれの小計も表示する。単一タイミングのみの場合はグループ表示自体を行わない。

**Rationale**:

- 現状の`CartItem`（`src/lib/cart/types.ts:1-8`）は`productId, productName, thumbnail, quantity, unitPrice, availability`のみを保持しており、支払いタイミングに関する情報を一切持たない。カート画面（`src/components/cart-sidebar.tsx`）で会員に事前提示するには、この型に`paymentTiming`を追加し、カート追加時（商品詳細ページの「カートに追加」導線）にSanityから取得した値をコピーする必要がある
- チェックアウト完了後（`/order/complete`画面）にのみ分割の事実を知らせる設計（決定3のUser Story対応）だけでは、会員が事前に把握できず「思っていたのと違う」という体験になりうる。カート画面時点での可視化により、チェックアウトボタンを押す前に会員が納得した上で進められる
- 単一タイミングのみの場合にグループ見出しを出さないのは、対象外の会員にとって不要な視覚的ノイズを増やさないため（既存のシンプルなカート表示を壊さない）

**Alternatives considered**:

- チェックアウト画面（`/order/checkout`）でのみグループ表示し、カートサイドバーでは表示しない → カートサイドバーは商品追加のたびに開閉される主要な確認ポイントであり、ここで見えないと「チェックアウトボタンを押すまで気づけない」という問題が残るため、両方の画面で表示する方針とした

## 決定8: 2件のOrder保存は「両方成功 or 両方不成立」を保証し、Stripe呼び出し以降はロールバック対象外とする

**Decision**: `place-order.ts`で分割が発生する場合、Order A（checkout）・Order B（invoice）の`orderRepo.save()`呼び出しを連続して行い、片方が失敗した場合はもう片方（既に保存済みなら）を削除してからエラーを返す。Stripe Checkout Session作成・確認メール送信など、DB保存より後段の外部呼び出しについては、ロールバック対象に含めない（既存の単一注文フローが元々持っていた割り切りをそのまま踏襲する）。

**Rationale**:

- 分割によって「途中で失敗しうる工程」（Order A保存・Order B保存・Stripe呼び出し・通知送信）が単一注文フローと比べて実質的に増える。特に「Order Aの保存は成功したがOrder Bの保存が失敗する」という新しい失敗パターンは、会員のカートの一部（注文後払い分）が記録に残らないまま消えるという実害があるため、対処が必要
- 一方、Stripe Checkout Session作成やメール送信は、一度実行すると簡単には取り消せない外部副作用であり、これらを含めた補償トランザクション（Sagaパターン等）を組むのは本機能のスコープに対して過剰。既存の単一注文フローも同種のリスク（Order保存後にStripe呼び出しが失敗し、Stripeセッション未設定のOrderが残る）を許容しており、本機能もそれを踏襲すれば十分
- ロールバック対象を「DBへの2件のOrder保存」という狭い範囲に限定することで、実装は「保存が両方成功したことを確認してから次に進む」という単純な逐次処理＋失敗時のcompensating delete（DB削除のみ）で済み、追加の複雑な基盤（分散トランザクション等）を必要としない

**Alternatives considered**:

- Stripe呼び出し・通知送信まで含めた完全なロールバック（例: Stripe Checkoutセッションのexpire処理、送信済みメールの取り消し不可能性への対処）→ 既存の単一注文フローが持つリスク許容度を大幅に超える実装コストとなり、今回のスコープでは過剰と判断し却下

## 決定9: チェックアウト分割の判定は、会員のブラウザ側で保持されるカート情報（Cookie）を信用せず、サーバー側で商品IDから引き直した情報のみを使う

**Decision**: `place-order.ts`が「注文時払い」/「注文後払い」を振り分ける際の`paymentTiming`判定は、必ず`productRepo.findByIds`でサーバー側から都度取得した`ProductSnapshot.paymentTiming`を使う。クライアント（`PlaceOrderInput.cartItems`）から送信される情報は既存通り`sanityProductId`・`quantity`・`productName`のみとし、`paymentTiming`をクライアント入力として受け取らない。

**Rationale**:

- `src/lib/cart/cookie.ts`で確認した通り、会員のカート情報は署名なし・暗号化なしの平文Cookie（`document.cookie`経由でクライアントJSが直接書き込む）であり、ブラウザの開発者ツール等で誰でも自由に改変できる。この前提はカートに関する新しい発見ではなく、既存の`unitPrice`が同じ性質を持っている
- 既存の`place-order.ts`は、`unitPrice`・`isNegotiable`をクライアント入力からではなく、`sanityProductId`をキーにサーバー側で取得した`ProductSnapshot`から決定しており（`checkout/actions.ts`は`unitPrice`をそもそも送信していない）、クライアント入力を信頼しない設計が既に徹底されている。`paymentTiming`もこの既存の信頼境界の外側（クライアント入力）に置いてはならず、同じ境界の内側（サーバー側の商品情報）で判定する
- もしクライアントから送信された`paymentTiming`を分割判定に使ってしまうと、悪意ある会員がCookieを改変し、本来「注文後払い（運営者確認あり）」であるべき商品を「注文時払い」に見せかけて運営者の確認プロセスを迂回する、といった攻撃が理論上可能になる。価格自体はサーバー側で再計算されるため金銭的な実害は限定的だが、業務プロセス（運営者の内容確認）を迂回されること自体が問題

**Alternatives considered**:

- Cookieに署名（HMAC等）を付与し改竄検知する → 既存の`unitPrice`が既にこの対策なしで運用されており（サーバー側で信頼しない設計で十分に安全なため）、本機能のためだけにCookie署名の仕組みを新設するのは過剰。既存の設計方針（クライアント入力は表示専用、判定は常にサーバー側で再取得）を`paymentTiming`にも一貫して適用すれば追加コストなしで解決する
