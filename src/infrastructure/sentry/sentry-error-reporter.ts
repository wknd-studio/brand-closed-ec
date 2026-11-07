import * as Sentry from "@sentry/nextjs";
import type {
  ErrorReportContext,
  ErrorReporter,
} from "@/repositories/error-reporter";

export class SentryErrorReporter implements ErrorReporter {
  captureException(error: unknown, context?: ErrorReportContext): void {
    Sentry.captureException(error, context);
  }
}
