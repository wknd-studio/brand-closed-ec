import { OrderConcurrentlyModifiedError } from "@/domain/errors/order-concurrently-modified-error";

/** 読み直してやり直す回数の上限（最初の1回を含む） */
const MAX_ATTEMPTS = 3;

/**
 * 注文の読み取り〜保存（attempt）を、保存が別の書き手と競合した（OrderConcurrentlyModifiedError）
 * ときだけやり直す（楽観ロック。issue #721）。attempt は毎回注文を読み直すところから始めること。
 * 上限まで競合が続いたとき・競合以外の失敗は、そのまま投げる
 */
export async function retryOnOrderConflict<T>(
  attempt: () => Promise<T>
): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (error) {
      if (
        !(error instanceof OrderConcurrentlyModifiedError) ||
        n >= MAX_ATTEMPTS
      )
        throw error;
    }
  }
}
