import { z } from "zod";
import { apiError, apiOk } from "@/lib/api-response";
import { issueOtp } from "@/lib/otp";

const resendSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  purpose: z.enum(["register", "login", "recovery"]),
});

/** Resend an OTP code honoring cooldowns and rate limits. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request.", 400);
  }
  const result = await issueOtp(parsed.data.email, parsed.data.purpose);
  if (!result.ok) {
    return apiError(result.error ?? "Could not resend the code.", 429);
  }
  return apiOk({ sent: true, emailPending: result.emailPending ?? false });
}
