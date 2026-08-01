-- 商品別支払いタイミング設定とカート分割注文（specs/004-split-order-payment-timing）
-- チェックアウト分割によって同時生成された2件のOrder（checkout/invoice）を
-- 関連付けるためのID。分割が発生しない場合はNULLのまま（後方互換）。

ALTER TABLE public.orders
  ADD COLUMN split_group_id UUID;

CREATE INDEX orders_split_group_id_idx
  ON public.orders(split_group_id)
  WHERE split_group_id IS NOT NULL;
