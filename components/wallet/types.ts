export interface WalletRow {
  id: string;
  ownerType: string;
  ownerId: string;
  currency: string;
  balanceMinor: number;
}

export interface EntryRow {
  id: string;
  direction: string;
  amountMinor: number;
  currency: string;
  reference: string;
  status: string;
  kind: string;
  createdAt: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  documentId?: string | null;
}

export interface WithdrawalRow {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  providerStatus?: string | null;
  providerReference?: string | null;
  failureReason?: string | null;
  createdAt: string;
}

export interface AvailabilityRow {
  walletId: string;
  balanceMinor: number;
  reservedMinor: number;
  availableMinor: number;
}

export interface MemberAccountRow {
  userId: string;
  currency: string;
  savingsTargetMinor: number | null;
  minContributionMinor: number | null;
  maxContributionMinor: number | null;
  minWithdrawalMinor: number | null;
  startDate: string | null;
  targetDate: string | null;
  frequency: string;
  withdrawalRules: { cooldownDays?: number; requiresApproval?: boolean };
  notifyEmail: boolean;
  notifyInApp: boolean;
  visibility: string;
  status: string;
}

export interface ProposedTx {
  amountMinor: number;
  currency: string;
  direction: string;
  reference?: string;
  sender?: string;
  recipient?: string;
  provider?: string;
  paymentStatus?: string;
  description?: string;
  occurredAt?: string;
  extractionConfidence?: number;
  extra?: Record<string, unknown>;
}

export async function readApi<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!res.ok || !body.ok || body.data === undefined) {
    throw new Error(body.error ?? "Something went wrong. Please try again.");
  }
  return body.data;
}
