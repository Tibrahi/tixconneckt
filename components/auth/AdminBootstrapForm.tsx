"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ROUTES } from "@/lib/routes";
import { adminBootstrapSchema, type AdminBootstrapInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";
import { OtpForm } from "./OtpForm";
import { stripSelectedCallingCode } from "@/lib/phone";
import { countryFlagForCode } from "@/lib/country-flag";

interface CountryOption {
  name: string;
  cca2: string;
  callingCode: string;
  flag: string;
}

function verifiedRole(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "role" in data) {
    const role = (data as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  }
  return null;
}

/**
 * First-owner setup. Rendered only when zero admins exist (the page and the
 * API both enforce that); behaves like registration otherwise, including the
 * email-OTP activation step. An already-registered email is never upgraded —
 * after code verification its owner is pointed at the admin sign-in instead.
 */
export function AdminBootstrapForm() {
  const router = useRouter();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [countryCca2, setCountryCca2] = useState("");
  const [callingCode, setCallingCode] = useState("");

  const form = useForm<AdminBootstrapInput>({
    resolver: zodResolver(adminBootstrapSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      country: "",
      countryCode: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      acceptPrivacy: false,
      acceptTerms: false,
      acceptAgreement: false,
    } as unknown as AdminBootstrapInput,
  });

  useEffect(() => {
    fetch("/api/meta/countries", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ok: boolean; data?: CountryOption[] }) => {
        if (data.ok && data.data) setCountries(data.data);
      })
      .catch(() => {});
  }, []);

  function selectCountry(cca2: string) {
    const found = countries.find((c) => c.cca2 === cca2);
    form.setValue("country", found?.name ?? "");
    form.setValue("countryCode", found?.callingCode ?? "");
    setCountryCca2(cca2);
    setCallingCode(found?.callingCode ?? "");
  }

  async function onSubmit(values: AdminBootstrapInput) {
    setError(null);
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { email: string; emailPending?: boolean };
        error?: string;
        details?: Record<string, string[]>;
      };
      if (!res.ok || !body.ok || !body.data) {
        if (body.details) {
          for (const [field, messages] of Object.entries(body.details)) {
            form.setError(field as keyof AdminBootstrapInput, { message: messages[0] });
          }
        }
        setError(body.error ?? "We couldn't create the owner account. Your entered information is still available. Please try again.");
        return;
      }
      setRegisteredEmail(body.data.email);
      setEmailPending(body.data.emailPending ?? false);
    } catch {
      setError("Your connection was interrupted. Your entered information is still available. Please try again.");
    }
  }

  if (alreadyRegistered && registeredEmail) {
    return (
      <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Already registered">
        <h1 className="text-lg font-semibold text-black">Already registered</h1>
        <p className="mb-4 mt-1 text-sm text-neutral-600">
          <span className="font-mono">{registeredEmail}</span> already has an account, so
          it was not changed. If it is an administrator account, sign in below.
        </p>
        <Link href={ROUTES.adminLogin} className="text-sm font-medium text-[#1447e6] hover:underline">
          Go to administrator sign in
        </Link>
      </section>
    );
  }

  if (registeredEmail) {
    return (
      <OtpForm
        email={registeredEmail}
        purpose="register"
        emailPending={emailPending}
        submitLabel="Verify and activate"
        onVerified={(data) => {
          if (verifiedRole(data) === "admin") {
            router.replace(ROUTES.admin);
            router.refresh();
          } else {
            setAlreadyRegistered(true);
          }
        }}
      />
    );
  }

  const checkboxClass = "h-4 w-4 rounded border-neutral-300 accent-[#1447e6]";

  return (
    <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Set up the owner account">
      <h1 className="text-lg font-semibold text-black">Set up the owner account</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-600">
        Creates the first administrator. This page stops working as soon as one administrator exists.
      </p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Full name"
          autoComplete="name"
          required
          {...form.register("name")}
          error={form.formState.errors.name?.message}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          {...form.register("email")}
          error={form.formState.errors.email?.message}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            {...form.register("password")}
            error={form.formState.errors.password?.message}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            {...form.register("confirmPassword")}
            error={form.formState.errors.confirmPassword?.message}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Country"
            required
            value={countryCca2}
            onChange={(e) => selectCountry(e.target.value)}
            options={[
              { value: "", label: "Select country" },
              ...countries.map((c) => ({ value: c.cca2, label: `${c.flag || countryFlagForCode(c.cca2)} ${c.name}${c.callingCode ? ` (${c.callingCode})` : ""}` })),
            ]}
            error={form.formState.errors.country?.message}
          />
          <TextField
            label={`Phone number${callingCode ? ` (${callingCode})` : ""}`}
            type="tel"
            autoComplete="tel"
            placeholder="788 123 456"
            required
            {...form.register("phone")}
            onChange={(event) => {
              const localPhone = stripSelectedCallingCode(event.target.value, callingCode);
              form.setValue("phone", localPhone, { shouldDirty: true, shouldValidate: true });
            }}
            error={form.formState.errors.phone?.message}
          />
        </div>
        <fieldset className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
          <legend className="px-1 text-sm font-medium">Legal acceptance</legend>
          {(
            [
              { key: "acceptPrivacy", label: "Privacy Policy" },
              { key: "acceptTerms", label: "Terms of Service" },
              { key: "acceptAgreement", label: "User Agreement" },
            ] as const
          ).map((item) => (
            <div key={item.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id={`bootstrap-${item.key}`}
                className={`${checkboxClass} mt-0.5`}
                {...form.register(item.key)}
              />
              <label htmlFor={`bootstrap-${item.key}`} className="text-black">I accept the {item.label}.</label>
            </div>
          ))}
          {form.formState.errors.acceptPrivacy ||
          form.formState.errors.acceptTerms ||
          form.formState.errors.acceptAgreement ? (
            <p role="alert" className="text-xs font-medium text-[#1447e6]">
              Accepting all three documents is required to create the owner account.
            </p>
          ) : null}
        </fieldset>
        <Button variant="auth" type="submit" loading={form.formState.isSubmitting} className="w-full">
          Create owner account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        Administration already set up?{" "}
        <Link href={ROUTES.adminLogin} className="font-medium text-[#1447e6] hover:underline">
          Administrator sign in
        </Link>
      </p>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
