import type { ErrorReporter } from "@/repositories/error-reporter";
import type {
  OperatorNotification,
  OperatorNotifier,
} from "@/repositories/operator-notifier";

/**
 * 運営者に通知する。送れなくても注文・支払いの処理は失敗させず、ErrorReporter で知らせる（#830）。
 * 通知は気づくきっかけで、記録の本体は管理画面にあるため
 */
export async function notifyOperator(
  deps: { operatorNotifier: OperatorNotifier; errorReporter: ErrorReporter },
  notification: OperatorNotification,
  useCase: string
): Promise<void> {
  try {
    await deps.operatorNotifier.notify(notification);
  } catch (error) {
    deps.errorReporter.captureException(error, {
      tags: { useCase, step: "notifyOperator" },
      extra: { orderId: notification.orderId },
    });
    console.error(`[${useCase}] 運営者への通知に失敗しました:`, error);
  }
}
