import DOMPurify from "isomorphic-dompurify";

/** Sanitize untrusted HTML before rendering (project content, messages). */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li", "a", "code", "pre"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Plain-text guard for values rendered as text. */
export function toSafeText(value: unknown, maxLength = 8000): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, maxLength);
}
