"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ROUTES } from "@/lib/routes";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";
import { LegalModal } from "./LegalModal";
import { OtpForm } from "./OtpForm";

interface CountryOption {
  name: string;
  cca2: string;
  callingCode: string;
}

export function RegisterForm() {
  const router = useRouter();
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [modal, setModal] = useState<"privacy" | "terms" | "agreement" | null>(null);
  const [readDocs, setReadDocs] = useState({ privacy: false, terms: false, agreement: false });
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);
  const [countryCca2, setCountryCca2] = useState("");
  const [callingCode, setCallingCode] = useState("");

  const form = useForm<RegisterInput>({
    // The schema's input type (optional category default) differs from its
    // output type; defaultValues satisfy the output type at runtime.
    resolver: zodResolver(registerSchema) as unknown as Resolver<RegisterInput>,
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      country: "",
      countryCode: "",
      category: "individual",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      acceptPrivacy: false,
      acceptTerms: false,
      acceptAgreement: false,
    } as unknown as RegisterInput,
  });

  useEffect(() => {
    fetch("/api/meta/countries")
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

  async function onSubmit(values: RegisterInput) {
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
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
            form.setError(field as keyof RegisterInput, { message: messages[0] });
          }
        }
        setError(body.error ?? "We couldn't create your account. Your entered information is still available. Please try again.");
        return;
      }
      setRegisteredEmail(body.data.email);
      setEmailPending(body.data.emailPending ?? false);
    } catch {
      setError("Your connection was interrupted. Your entered information is still available. Please try again.");
    }
  }

  if (registeredEmail) {
    return (
      <OtpForm
        email={registeredEmail}
        purpose="register"
        emailPending={emailPending}
        submitLabel="Verify and activate"
        onVerified={() => {
          router.push(ROUTES.dashboard);
          router.refresh();
        }}
      />
    );
  }

  const checkboxClass =
    "h-4 w-4 rounded border-neutral-300 accent-blue-700";

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6" aria-label="Create account">
      <h1 className="text-lg font-semibold text-black">Create your account</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-600">
        Read each legal document, then check the boxes to accept.
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
              ...countries.map((c) => ({ value: c.cca2, label: `${c.name} (${c.callingCode})` })),
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
            error={form.formState.errors.phone?.message}
          />
        </div>
        <SelectField
          label="Account category"
          {...form.register("category")}
          options={[
            { value: "individual", label: "Individual" },
            { value: "university", label: "University" },
            { value: "government", label: "Government organization" },
            { value: "provider", label: "Funding / support provider" },
          ]}
        />

        <fieldset className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
          <legend className="px-1 text-sm font-medium">Legal acceptance</legend>
          {(
            [
              { key: "acceptPrivacy", doc: "privacy", label: "Privacy Policy" },
              { key: "acceptTerms", doc: "terms", label: "Terms of Service" },
              { key: "acceptAgreement", doc: "agreement", label: "User Agreement" },
            ] as const
          ).map((item) => (
            <div key={item.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id={item.key}
                className={`${checkboxClass} mt-0.5`}
                disabled={!readDocs[item.doc]}
                {...form.register(item.key)}
              />
              <label htmlFor={item.key} className={!readDocs[item.doc] ? "text-neutral-500" : "text-black"}>
                I accept the{" "}
                <button
                  type="button"
                  onClick={() => setModal(item.doc)}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {item.label}
                </button>
                {!readDocs[item.doc] ? " (read it first to enable this checkbox)" : ""}
              </label>
            </div>
          ))}
          {form.formState.errors.acceptPrivacy ||
          form.formState.errors.acceptTerms ||
          form.formState.errors.acceptAgreement ? (
            <p role="alert" className="text-xs font-medium text-red-700">
              Reading and accepting all three documents is required.
            </p>
          ) : null}
        </fieldset>

        <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        Already have an account?{" "}
        <Link href={ROUTES.login} className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      {modal ? (
        <LegalModal
          title={modal === "privacy" ? "Privacy Policy" : modal === "terms" ? "Terms of Service" : "User Agreement"}
          docType={modal}
          onAccept={() => setReadDocs((r) => ({ ...r, [modal]: true }))}
          onClose={() => setModal(null)}
        />
      ) : null}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
