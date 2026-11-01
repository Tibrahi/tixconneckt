import { generateImage } from "@/lib/muse/image";
import { aiImageConfigured } from "@/lib/config";
import { apiError, apiOk } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { aiImageGenerateSchema } from "@/lib/validation";

/**
 * Generate a profile or cover picture with Muse Image. Returns a preview
 * data URL — nothing is saved until the user applies it through the
 * regular PUT /api/profile/media upload, which re-validates and stores
 * the bytes in our own storage (never a temporary provider URL).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-image", session.user.id, 10, "1 h");
  if (!rl.allowed) return apiError("Too many image generations. Please try again later.", 429);
  if (!aiImageConfigured()) {
    return apiError("Image generation is not configured.", 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = aiImageGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Describe the image you want.", 400);
  }
  const input = parsed.data;

  const result = await generateImage({
    prompt: input.prompt,
    size: input.kind === "avatar" ? "1024x1024" : "1792x1024",
    style: input.style,
  });
  if (!result.bytes || !result.mimeType) {
    return apiError(result.error ?? "Image generation failed. Please try again.", 502);
  }
  return apiOk({
    preview: `data:${result.mimeType};base64,${result.bytes.toString("base64")}`,
    mimeType: result.mimeType,
    revisedPrompt: result.revisedPrompt ?? null,
  });
}
