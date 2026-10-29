import { getSession } from "@/lib/session";
import { apiError, apiOk } from "@/lib/api-response";
import { AI_TASKS } from "@/lib/ai-tasks";
import { aiSparkConfigured, aiVoiceConfigured } from "@/lib/config";

/** List dynamic AI tasks and their real availability. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  return apiOk({
    sparkConfigured: aiSparkConfigured(),
    voiceConfigured: aiVoiceConfigured(),
    tasks: AI_TASKS.map((t) => ({
      id: t.id,
      engine: t.engine,
      label: t.label,
      description: t.description,
      supported: t.supported,
      unsupportedReason: t.unsupportedReason,
      needsAudio: t.needs.includes("audio"),
    })),
  });
}
