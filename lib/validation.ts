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
  phone: z.string().trim().max(32).refine((value) => value === "" || value.length >= 4, "Phone number is too short").optional(),
  country: z.string().trim().max(120).refine((value) => value === "" || value.length >= 2, "Country is too short").optional(),
  countryCode: z.string().trim().max(6).refine(
    (value) => value === "" || /^[A-Za-z]{2,3}$/.test(value) || /^\+[0-9]{1,5}$/.test(value),
    "Enter a valid country code (e.g. RW or +250)",
  ).optional(),
  educationLevel: z.string().trim().max(120).optional(),
  objectives: z.string().trim().max(2000).optional(),
  major: z.string().trim().max(200).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  strengths: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  fields: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  bio: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  githubUrl: z.string().trim().max(200).refine(
    (value) => value === "" || /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/?$/.test(value),
    "Enter a valid GitHub profile URL (https://github.com/username)",
  ).optional(),
  contactVisibility: z.enum(["public", "connections", "private"]).optional(),
  financialVisibility: z.enum(["private", "connections"]).optional(),
  profileVisibility: z.enum(["public", "connections", "private"]).optional(),
  providerKind: z.enum(["loan", "support"]).nullable().optional(),
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
  /**
   * Optional project context: "express interest" in a public project owned by
   * the target user. The route verifies project visibility and that the
   * target owns the project before accepting it.
   */
  projectId: z.string().uuid("Unknown project.").optional(),
});

/**
 * Project-interest notification copy. Pure and unit-tested. Only the
 * requester's display name and the public project title are included —
 * never private contact details.
 */
export function projectInterestCopy(requesterName: string, projectTitle: string): {
  title: string;
  body: string;
} {
  return {
    title: "Interest in your project",
    body: `${requesterName} is interested in "${projectTitle}" and wants to connect with you.`,
  };
}

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

/** Shared reference attached to a chat message (project/profile/request). */
export const chatReferenceSchema = z.object({
  type: z.enum(["project", "profile", "request"]),
  id: z.string().min(1).max(128),
});

/** Rich message creation: text + optional reply, attachment, reference, analysis. */
export const chatMessageCreateSchema = z.object({
  body: z.string().max(8000).default(""),
  clientMessageId: z.string().trim().min(1).max(80),
  replyToId: z.string().min(1).max(128).optional(),
  attachmentId: z.string().min(1).max(128).optional(),
  reference: chatReferenceSchema.optional(),
  /** Client-shared AI analysis render (the sender's own content, like body text). */
  analysis: z.record(z.string(), z.unknown()).optional(),
});

/** Single-emoji reaction (modifiers allowed, plain text rejected). */
export const chatReactionSchema = z
  .object({ emoji: z.string().trim().min(1).max(16) })
  .refine((v) => Array.from(v.emoji).length <= 4 && /\p{Extended_Pictographic}/u.test(v.emoji), {
    message: "Reactions must be a single emoji.",
    path: ["emoji"],
  });

export const chatForwardSchema = z.object({
  messageId: z.string().min(1).max(128),
  toConversationId: z.string().min(1).max(128),
});

export const chatSettingsSchema = z.object({
  muted: z.boolean().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const chatSummarizeSchema = z.object({
  taskId: z.enum(["summarize_conversation", "summarize_decisions", "extract_action_items"]),
  goal: z.string().trim().max(2000).optional(),
  limit: z.coerce.number().int().min(10).max(200).default(100),
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
  z
    .object({
      kind: z.literal("media-state"),
      muted: z.boolean().optional(),
      cameraOff: z.boolean().optional(),
    })
    .strict(),
]);

export type CallSignalInput = z.infer<typeof callSignalSchema>;

export const callDecisionSchema = z.object({
  decision: z.enum(["accepted", "declined", "ended", "failed"]),
  /** Honest failure reason when marking a call failed. */
  reason: z.string().trim().max(200).optional(),
});

export type CallDecisionInput = z.infer<typeof callDecisionSchema>;

/** Per-call transcription consent toggle (either participant). */
export const callTranscriptConsentSchema = z.object({
  consented: z.boolean(),
});

/** One transcript segment: text only, never raw audio. */
export const callTranscriptSegmentSchema = z.object({
  segmentIndex: z.number().int().min(0).max(10000),
  /** Speaker attribution, only when the diarization path is reliable. */
  speaker: z.string().trim().max(80).optional(),
  text: z.string().trim().min(1).max(2000),
  final: z.boolean().default(true),
  turnId: z.number().int().min(0).optional(),
});

export const callTranscriptSegmentsSchema = z.object({
  segments: z.array(callTranscriptSegmentSchema).min(1).max(200),
});

/** Hide/show an ended call in personal history (missed/declined/failed stay). */
export const callHideSchema = z.object({
  hidden: z.boolean(),
});

export const projectSubmitSchema = z.object({
  title: z.string().trim().min(4, "Title is required").max(200),
  summary: z.string().trim().min(20, "Summary needs detail (20+ chars)").max(5000),
  details: z.string().trim().max(20000).optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  groupId: z.string().min(1).optional(),
  /** Optional dynamic attributes, validated as flexible fields. */
  attributes: z.record(z.string(), z.unknown()).default({}),
  /** Collaborators invited at creation (identifier + role). */
  collaborators: z
    .array(z.object({ shortId: shortIdSchema, role: z.enum(["editor", "viewer"]) }))
    .max(50)
    .default([]),
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

/** Workspace folder create/rename/move (Project.md §4). */
export const projectFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  parentFolderId: z.string().min(1).max(128).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Workspace file create (title/type free-form, content structured JSON). */
export const projectFileCreateSchema = z.object({
  folderId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  documentType: z.string().trim().min(1).max(60).default("document"),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  attachmentId: z.string().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Document save with optimistic concurrency (409 on version conflict). */
export const projectFileSaveSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  documentType: z.string().trim().min(1).max(60).optional(),
  contentJson: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().positive(),
  milestone: z.string().trim().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Collaborator invite / role change (owner | editor | viewer). */
export const projectMemberSchema = z.object({
  shortId: shortIdSchema,
  role: z.enum(["owner", "editor", "viewer"]),
});

/** Provider share grant (explicit files/folders + optional expiry). */
export const projectShareSchema = z.object({
  providerId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128).optional(),
  fileIds: z.array(z.string().min(1).max(128)).max(200).default([]),
  folderIds: z.array(z.string().min(1).max(128)).max(100).default([]),
  accessDays: z.number().int().min(1).max(365).optional(),
  reviewRequested: z.boolean().optional(),
});

/** Funding request with attached project documents (Project.md §9). */
export const fundingRequestDocumentsSchema = z.object({
  fileIds: z.array(z.string().min(1).max(128)).max(200).default([]),
  folderIds: z.array(z.string().min(1).max(128)).max(100).default([]),
  accessDays: z.number().int().min(1).max(365).optional(),
});

/** Provider response document (dynamic title/structure). */
export const providerResponseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  documentType: z.string().trim().min(1).max(60).default("response"),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  submit: z.boolean().default(false),
});

/** Document assistant task on the active file (Project.md §6). */
export const projectAssistSchema = z.object({
  task: z.enum([
    "summarize",
    "missing_info",
    "improve",
    "rewrite_selection",
    "generate_section",
    "proposal",
    "budget",
    "research",
    "loan_request",
    "support_request",
    "analyze_responses",
    "compare_versions",
    "ask",
  ]),
  selection: z.string().max(20000).optional(),
  instruction: z.string().trim().max(4000).optional(),
  versionA: z.number().int().positive().optional(),
  versionB: z.number().int().positive().optional(),
  question: z.string().trim().max(4000).optional(),
  fileIds: z.array(z.string().min(1).max(128)).max(10).optional(),
});

/** Organization profile (Project.md §12). */
export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
  country: z.string().trim().max(120).optional(),
  contact: z.record(z.string(), z.unknown()).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  logoDocumentId: z.string().min(1).max(128).nullable().optional(),
});

/** Verification evidence submission. */
export const verificationSubmitSchema = z.object({
  evidenceDocumentIds: z.array(z.string().min(1).max(128)).min(1).max(20),
  note: z.string().trim().max(4000).optional(),
});

/** Admin verification decision (rejection needs a reason). */
export const verificationDecisionSchema = z.object({
  verificationId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(2000).optional(),
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

/**
 * Payment-method binding. Only a type, a masked display label, and an
 * optional provider-issued reference — raw credentials have no fields.
 */
export const paymentMethodBindSchema = z.object({
  type: z.enum(["card", "mobile_money", "crypto", "bank"]),
  displayLabel: z
    .string()
    .trim()
    .min(2, "Describe the method (e.g. Visa •• 4242).")
    .max(60)
    .refine((v) => !/^(?:pin|cvv|cvc|password)\s*[:=]?\s*\S+/i.test(v), "Never enter PINs, CVVs, or passwords."),
  providerRef: z.string().trim().max(120).optional(),
});

export type PaymentMethodBindInput = z.infer<typeof paymentMethodBindSchema>;

/** AI profile/cover picture generation request. */
export const aiImageGenerateSchema = z.object({
  kind: z.enum(["avatar", "cover"]),
  prompt: z.string().trim().min(10, "Describe the image in at least a few words.").max(2000),
  style: z.enum(["natural", "photographic", "illustration", "minimal"]).default("natural"),
});

/** Profile-assistant proposal: the reviewable subset of profileUpdateSchema. */
export const profileProposalSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(32).refine((value) => value === "" || value.length >= 4, "Phone number is too short").optional(),
  country: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().max(6).refine(
    (value) => value === "" || /^[a-z]{2,3}$/i.test(value) || /^\+[1-9]\d{0,4}$/.test(value),
    "Enter an ISO country code or calling code",
  ).optional(),
  educationLevel: z.string().trim().max(120).optional(),
  objectives: z.string().trim().max(2000).optional(),
  major: z.string().trim().max(200).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  strengths: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  fields: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  bio: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  githubUrl: z.string().trim().max(200).refine(
    (value) => value === "" || /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/?$/.test(value),
    "Enter a valid GitHub profile URL",
  ).optional(),
});

export type ProfileProposal = z.infer<typeof profileProposalSchema>;

/** Canonical profile field names accepted in an AI proposal. */
const PROFILE_PROPOSAL_FIELDS = [
  "name",
  "phone",
  "country",
  "countryCode",
  "educationLevel",
  "objectives",
  "major",
  "skills",
  "strengths",
  "fields",
  "bio",
  "location",
  "githubUrl",
] as const;

/** Explicit alias map: legacy/provider names → canonical profile field. */
const PROFILE_PROPOSAL_ALIASES: Record<string, string[]> = {
  name: ["fullName", "full_name", "displayName", "display_name"],
  phone: ["mobile", "telephone", "telephoneNumber", "telephone_number"],
  country: ["countryName", "country_name", "nation"],
  countryCode: ["country_code", "dialCode", "dial_code", "callingCode", "calling_code"],
  educationLevel: ["education", "education_level", "qualification"],
  objectives: ["objective", "goals", "goal", "careerObjectives", "career_objectives", "ambitions"],
  major: ["degree", "program", "programme", "specialization"],
  skills: ["technicalSkills", "technical_skills", "capabilities", "expertise"],
  strengths: ["personalStrengths", "personal_strengths"],
  fields: ["sectors", "sector", "industries", "industry", "domains", "domain"],
  bio: ["biography", "summary", "about", "aboutMe", "description"],
  location: ["city", "address", "basedIn", "based_in", "place"],
  githubUrl: ["github", "github_url", "githubProfile", "github_profile"],
};

/** Wrapper keys unwrapped when the model nests the proposal one level deep. */
const PROFILE_PROPOSAL_WRAPPERS = ["profile", "proposal", "fields", "values", "data", "result"];

const PROFILE_LIST_FIELDS = new Set(["skills", "strengths", "fields"]);

/** Structured-output contract for profile interpretation. */
export const PROFILE_PROPOSAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" }, phone: { type: "string" }, country: { type: "string" }, countryCode: { type: "string" },
    educationLevel: { type: "string" }, objectives: { type: "string" }, major: { type: "string" },
    skills: { type: "array", items: { type: "string" } }, strengths: { type: "array", items: { type: "string" } },
    fields: { type: "array", items: { type: "string" } }, bio: { type: "string" }, location: { type: "string" }, githubUrl: { type: "string" },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceStringList(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]+/) : [];
  const cleaned = items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Map an AI profile proposal onto canonical field names. Resolves documented
 * aliases, fills gaps from one level of nesting, coerces delimited strings
 * to lists, and drops empty values so the assistant never blanks a field.
 * Unknown keys are rejected for manual review — never silently persisted.
 */
export function normalizeProfileProposal(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const sources = [raw];
  for (const wrapper of PROFILE_PROPOSAL_WRAPPERS) {
    const nested = raw[wrapper];
    if (isRecord(nested)) sources.push(nested);
  }
  const normalized: Record<string, unknown> = {};
  for (const field of PROFILE_PROPOSAL_FIELDS) {
    const candidates = [field, ...(PROFILE_PROPOSAL_ALIASES[field] ?? [])];
    for (const source of sources) {
      let found = false;
      for (const key of candidates) {
        if (!(key in source)) continue;
        const value = source[key];
        if (PROFILE_LIST_FIELDS.has(field)) {
          const list = coerceStringList(value);
          if (list) {
            normalized[field] = list;
            found = true;
          }
        } else if (typeof value === "string" && value.trim()) {
          normalized[field] = value.trim();
          found = true;
        }
        break;
      }
      if (found) break;
    }
  }
  return normalized;
}
