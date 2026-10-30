import { z } from "zod";

export const shortIdSchema = z
  .string()
  .trim()
  .length(4, "Identifier must be 4 characters")
  .regex(/^[A-Z0-9]{4}$/, "Identifier must be uppercase letters and digits");

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Full name is required").max(120),
    email: z.string().trim().toLowerCase().email("Valid email is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Z]/, "Password needs an uppercase letter")
      .regex(/[a-z]/, "Password needs a lowercase letter")
      .regex(/[0-9]/, "Password needs a digit"),
    confirmPassword: z.string(),
    phone: z.string().trim().min(4, "Phone number is required").max(32),
    country: z.string().trim().min(2, "Country is required").max(120),
    countryCode: z
      .string()
      .trim()
      .regex(/^\+[0-9]{1,5}$/, "Country calling code like +250 is required"),
    category: z
      .enum(["individual", "university", "government", "provider"])
      .default("individual"),
    timezone: z.string().trim().max(80).optional(),
    acceptPrivacy: z.literal(true, "Privacy Policy acceptance is required"),
    acceptTerms: z.literal(true, "Terms acceptance is required"),
    acceptAgreement: z.literal(true, "Agreement acceptance is required"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const otpVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^[0-9]{6}$/, "Code must be 6 digits"),
  purpose: z.enum(["register", "login", "recovery"]),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const recoveryRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
});

export const passwordResetSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(4).max(32).optional(),
  country: z.string().trim().min(2).max(120).optional(),
  educationLevel: z.string().trim().max(120).optional(),
  objectives: z.string().trim().max(2000).optional(),
  major: z.string().trim().max(200).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  strengths: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  fields: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  bio: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  contactVisibility: z.enum(["public", "connections", "private"]).optional(),
  financialVisibility: z.enum(["private", "connections"]).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const matchingAnswerSchema = z.object({
  objective: z.string().trim().min(3).max(2000),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
  strengths: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  field: z.string().trim().min(2).max(200),
  education: z.string().trim().max(200).optional(),
});

export type MatchingAnswerInput = z.infer<typeof matchingAnswerSchema>;

export const connectionRequestSchema = z.object({
  shortId: shortIdSchema,
});

export const messageSendSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1, "Message is empty").max(8000),
  clientMessageId: z.string().trim().min(1).max(80),
});

export type MessageSendInput = z.infer<typeof messageSendSchema>;

export const conversationCreateSchema = z.object({
  type: z.enum(["direct", "group", "provider"]),
  title: z.string().trim().max(200).optional(),
  memberShortIds: z.array(shortIdSchema).max(50).optional(),
  groupId: z.string().min(1).optional(),
  providerLinkId: z.string().min(1).optional(),
});

export const callCreateSchema = z.object({
  conversationId: z.string().min(1).max(128),
  kind: z.enum(["audio", "video"]),
});

export type CallCreateInput = z.infer<typeof callCreateSchema>;

/** WebRTC signaling payloads relayed between the two call parties. */
export const callSignalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer"), sdp: z.string().min(1).max(32768) }).strict(),
  z.object({ kind: z.literal("answer"), sdp: z.string().min(1).max(32768) }).strict(),
  z
    .object({
      kind: z.literal("candidate"),
      candidate: z.string().min(1).max(4096),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
    })
    .strict(),
]);

export type CallSignalInput = z.infer<typeof callSignalSchema>;

export const callDecisionSchema = z.object({
  decision: z.enum(["accepted", "declined", "ended"]),
});

export type CallDecisionInput = z.infer<typeof callDecisionSchema>;

export const projectSubmitSchema = z.object({
  title: z.string().trim().min(4, "Title is required").max(200),
  summary: z.string().trim().min(20, "Summary needs detail (20+ chars)").max(5000),
  details: z.string().trim().max(20000).optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  groupId: z.string().min(1).optional(),
  /** Optional dynamic attributes, validated as flexible fields. */
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export type ProjectSubmitInput = z.infer<typeof projectSubmitSchema>;

export const contributionSchema = z.object({
  projectId: z.string().min(1),
  body: z.string().trim().min(1).max(8000),
});

export const replySchema = z.object({
  contributionId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
});

export const fundingRequestSchema = z.object({
  projectId: z.string().min(1),
  requesterType: z.enum(["individual", "group"]),
  requesterId: z.string().min(1),
  providerId: z.string().min(1).optional(),
  amountMinor: z.number().int().positive("Amount must be positive"),
  currency: z.string().trim().length(3).default("USD"),
  message: z.string().trim().max(4000).optional(),
});

export const agreementSchema = z.object({
  requestId: z.string().min(1),
  title: z.string().trim().min(4).max(200),
  terms: z.string().trim().max(20000).optional(),
});

export const actionScheduleSchema = z.object({
  kind: z.enum(["message", "profile_update", "reminder", "workflow"]),
  title: z.string().trim().min(3).max(200),
  payload: z.record(z.string(), z.unknown()),
  scheduledFor: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(80),
  groupId: z.string().min(1).optional(),
  /** Client idempotency key; double submits return the same action. */
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export type ActionScheduleInput = z.infer<typeof actionScheduleSchema>;

/**
 * Composite workflow steps: a reviewed sequence of at most 5 sub-actions.
 * Nesting workflows inside workflows is rejected structurally.
 */
export const workflowStepsSchema = z
  .array(
    z.object({
      kind: z.enum(["message", "reminder", "profile_update"]),
      title: z.string().trim().min(1).max(200).optional(),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  .max(5, "A workflow holds at most 5 steps.");

export type WorkflowSteps = z.infer<typeof workflowStepsSchema>;

/**
 * AI-extracted transaction proposal — validated before any financial use.
 * Only the required fields are extracted; everything else stays in `extra`
 * for review. Members cannot edit these values directly (wallet.md FR-02).
 */
export const transactionProposalSchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3),
  direction: z.enum(["credit", "debit"]),
  reference: z.string().trim().max(120).optional(),
  sender: z.string().trim().max(200).optional(),
  recipient: z.string().trim().max(200).optional(),
  provider: z.string().trim().max(80).optional(),
  paymentStatus: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  /** Extraction confidence 0..1; below threshold needs manual review. */
  extractionConfidence: z.number().min(0).max(1).optional(),
});

export type TransactionProposal = z.infer<typeof transactionProposalSchema>;

/** Confidence below this is flagged for manual review, never auto-trusted. */
export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.6;

/** Per-member savings account configuration (wallet.md FR-06). */
export const accountSettingsSchema = z
  .object({
    currency: z.string().trim().length(3).optional(),
    savingsTargetMinor: z.number().int().positive().nullable().optional(),
    minContributionMinor: z.number().int().positive().nullable().optional(),
    maxContributionMinor: z.number().int().positive().nullable().optional(),
    minWithdrawalMinor: z.number().int().positive().nullable().optional(),
    startDate: z.string().datetime({ offset: true }).nullable().optional(),
    targetDate: z.string().datetime({ offset: true }).nullable().optional(),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "once"]).optional(),
    withdrawalRules: z
      .object({
        cooldownDays: z.number().int().min(0).max(365).optional(),
        requiresApproval: z.boolean().optional(),
      })
      .optional(),
    notifyEmail: z.boolean().optional(),
    notifyInApp: z.boolean().optional(),
    visibility: z.enum(["private", "group_totals"]).optional(),
  })
  .refine(
    (v) =>
      v.minContributionMinor == null ||
      v.maxContributionMinor == null ||
      v.minContributionMinor <= v.maxContributionMinor,
    { message: "Minimum contribution cannot exceed maximum contribution.", path: ["minContributionMinor"] },
  )
  .refine(
    (v) =>
      v.startDate == null ||
      v.targetDate == null ||
      new Date(v.startDate).getTime() <= new Date(v.targetDate).getTime(),
    { message: "Start date cannot be after target date.", path: ["startDate"] },
  );

export type AccountSettingsInput = z.infer<typeof accountSettingsSchema>;

/** Independent review decision (wallet.md FR-04). Rejection needs a reason. */
export const reviewDecisionSchema = z
  .object({
    entryId: z.string().min(1),
    decision: z.enum(["approved", "rejected", "needs_evidence"]),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.decision !== "rejected" || (v.reason?.length ?? 0) > 0, {
    message: "A reason is required when rejecting a transaction.",
    path: ["reason"],
  })
  .refine((v) => v.decision !== "needs_evidence" || (v.reason?.length ?? 0) > 0, {
    message: "Describe what additional evidence is needed.",
    path: ["reason"],
  });

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

/** Reviewer-verified values for evidence the AI could not parse. */
export const manualCreditSchema = z.object({
  parsingJobId: z.string().min(1),
  verified: transactionProposalSchema.omit({ extractionConfidence: true }),
  reason: z.string().trim().min(3).max(2000),
});

export type ManualCreditInput = z.infer<typeof manualCreditSchema>;

/** Member withdrawal request from their own wallet (wallet.md FR-08). */
export const individualWithdrawalSchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3),
  /** Client idempotency key; the server generates one when omitted. */
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export type IndividualWithdrawalInput = z.infer<typeof individualWithdrawalSchema>;

export const selfFundingSchema = z.object({
  walletId: z.string().min(1).optional(),
  currency: z.string().trim().length(3).default("USD"),
  transaction: transactionProposalSchema,
  documentId: z.string().min(1).optional(),
  parsingJobId: z.string().min(1).optional(),
});

export const contributionCreateSchema = z.object({
  walletId: z.string().min(1),
  goalId: z.string().min(1).optional(),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3),
});

export const withdrawalRequestSchema = z.object({
  walletId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3),
});

export const groupCreateSchema = z.object({
  name: z.string().trim().min(3, "Group name is required").max(120),
  description: z.string().trim().max(2000).optional(),
  objective: z.string().trim().max(2000).optional(),
  memberShortIds: z.array(shortIdSchema).max(50).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
