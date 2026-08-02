import { useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";

/**
 * scrapingCatalogドキュメント画面に追加する「今すぐ実行」ボタン（User Story 2, FR-021）。
 * トリガーAPI（/api/admin/product-import/trigger）を呼び出すだけで、
 * 実行自体はGitHub Actions上で非同期に行われる（contracts/trigger-api.md）。
 * このボタンの実行結果（成功見込み・エラー見込み）は「商品管理 →
 * インポート実行結果」に後で表示される`ProductImportRun`で確認する。
 * トークンはSanity Studio（Viteビルド）の慣例に従い`SANITY_STUDIO_`接頭辞の
 * 環境変数（`process.env`経由でビルド時にクライアントバンドルへ埋め込まれる）から取得する
 * （GitHub PAT自体はサーバーサイドのみに保持）。
 */
export const OnDemandTriggerAction: DocumentActionComponent = (
  props: DocumentActionProps
) => {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  return {
    label:
      status === "loading"
        ? "実行をリクエスト中..."
        : status === "done"
          ? "実行をリクエストしました"
          : "今すぐ実行",
    disabled: status === "loading" || status === "done",
    tone: status === "error" ? "critical" : "positive",
    onHandle: async () => {
      setStatus("loading");
      try {
        const res = await fetch("/api/admin/product-import/trigger", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Product-Import-Token":
              process.env.SANITY_STUDIO_PRODUCT_IMPORT_TRIGGER_TOKEN ?? "",
          },
          body: JSON.stringify({ catalogId: props.id }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(body.error ?? `リクエストに失敗しました（${res.status}）`);
          return;
        }

        setStatus("done");
        setMessage(
          "実行をリクエストしました。完了後、商品管理 → インポート実行結果に記録されます"
        );
      } catch {
        setStatus("error");
        setMessage("リクエストに失敗しました");
      } finally {
        props.onComplete();
      }
    },
    dialog:
      message != null
        ? {
            type: "dialog" as const,
            onClose: () => setMessage(null),
            content: message,
          }
        : undefined,
  };
};
