export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** 属性値（"…"で囲む）に埋め込む */
export function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll('"', "&quot;");
}
