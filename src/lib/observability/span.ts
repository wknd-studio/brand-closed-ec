import * as Sentry from "@sentry/nextjs";

export function withWebhookSpan<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan({ name, op: "webhook.process" }, fn);
}

export function withServerActionSpan<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan({ name, op: "server-action.process" }, fn);
}
