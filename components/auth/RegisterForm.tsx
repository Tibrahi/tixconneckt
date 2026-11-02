"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ROUTES } from "@/lib/routes";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";
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

export function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [countries, setCountries] = useState<CountryOption[]>([]);
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
  const category = useWatch({ control: form.control, name: "category" });
  const steps = category === "individual"
    ? ["Your account", "Contact and role", "Review and accept"]
    : ["Your account", "Contact and role", "Organization details", "Review and accept"];

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
          const fields = Object.keys(body.details);
          if (fields.some((field) => ["organizationName", "organizationType", "jobTitle", "mandate", "providerKind", "serviceDescription"].includes(field))) {
            setStep(category === "individual" ? 1 : 2);
          } else if (fields.some((field) => ["country", "countryCode", "phone", "category"].includes(field))) {
            setStep(1);
          } else if (fields.some((field) => ["name", "email", "password", "confirmPassword"].includes(field))) {
            setStep(0);
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
    "h-4 w-4 rounded border-neutral-300 accent-[#1447e6]";

  async function continueRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) {
      const fields: (keyof RegisterInput)[] = step === 0
        ? ["name", "email", "password", "confirmPassword"]
        : step === 1
          ? ["country", "countryCode", "phone", "category"]
          : category === "provider"
            ? ["providerKind", "organizationName", "serviceDescription"]
            : category === "university"
              ? ["organizationName", "organizationType", "jobTitle"]
              : ["organizationName", "mandate", "jobTitle"];
      if (await form.trigger(fields)) setStep((current) => current + 1);
      return;
    }
    await form.handleSubmit(onSubmit)(event);
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card sm:p-6" aria-label="Create account">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1447e6]">Create account · Step {step + 1} of {steps.length}</p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {steps.map((label, index) => <span key={label} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-[#1447e6]" : "bg-neutral-200"}`} />)}
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-black">{steps[step]}</h1>
        <p className="mt-1 text-sm text-neutral-600">{step === 0 ? "Start with the details you use to sign in." : step === 1 ? "Add your contact details and choose how you will use TIXCONNECKT." : steps[step] === "Organization details" ? "Tell us the essential information for your organization profile." : "Review the legal documents and confirm your acceptance."}</p>
      </div>
      <form onSubmit={continueRegistration} className="flex flex-col gap-4" noValidate>
        {step === 0 ? <>
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
        </> : null}

        {step === 1 ? <>
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
        </> : null}

        {step === 2 && category === "provider" ? (
          <fieldset className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4">
            <legend className="px-1 text-sm font-semibold">Provider onboarding</legend>
            <p className="text-sm text-neutral-600">Choose the service your account is responsible for. Verification is reviewed separately after email activation.</p>
            <SelectField label="Service type" required {...form.register("providerKind")} options={[
              { value: "", label: "Select a service" },
              { value: "loan", label: "Funding / lending" },
              { value: "support", label: "Non-financial support" },
            ]} error={form.formState.errors.providerKind?.message} />
            <TextField label="Provider or organization name" required {...form.register("organizationName")} error={form.formState.errors.organizationName?.message} />
            <TextAreaField label="Service description" required {...form.register("serviceDescription")} error={form.formState.errors.serviceDescription?.message} hint="Describe the support or funding you offer." />
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-[#1447e6]">Add optional organization details</summary>
              <div className="mt-3 flex flex-col gap-4">
                <TextField label="Website (optional)" type="url" {...form.register("website")} error={form.formState.errors.website?.message} />
                <TextField label="Official contact email (optional)" type="email" {...form.register("officialEmail")} error={form.formState.errors.officialEmail?.message} />
                <TextField label="Coverage or service areas (optional)" {...form.register("jurisdiction")} />
              </div>
            </details>
          </fieldset>
        ) : null}

        {step === 2 && (category === "university" || category === "government") ? (
          <fieldset className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4">
            <legend className="px-1 text-sm font-semibold">{category === "university" ? "Institution onboarding" : "Agency onboarding"}</legend>
            <p className="text-sm text-neutral-600">This creates a private, unverified organization profile. Email verification does not verify institutional authority.</p>
            <TextField label={category === "university" ? "Institution name" : "Agency or ministry name"} required {...form.register("organizationName")} error={form.formState.errors.organizationName?.message} />
            {category === "university" ? (
              <TextField label="Institution type" required placeholder="University, college, research institute…" {...form.register("organizationType")} error={form.formState.errors.organizationType?.message} />
            ) : (
              <TextAreaField label="Mandate or program area" required {...form.register("mandate")} error={form.formState.errors.mandate?.message} />
            )}
            <TextField label="Your title or relationship" required {...form.register("jobTitle")} error={form.formState.errors.jobTitle?.message} />
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-[#1447e6]">Add optional organization details</summary>
              <div className="mt-3 flex flex-col gap-4">
                <TextField label="Department / faculty" {...form.register("department")} />
                <TextField label="Website (optional)" type="url" {...form.register("website")} error={form.formState.errors.website?.message} />
                <TextField label="Official contact email (optional)" type="email" {...form.register("officialEmail")} error={form.formState.errors.officialEmail?.message} />
                {category === "government" ? <TextField label="Jurisdiction (optional)" {...form.register("jurisdiction")} /> : null}
              </div>
            </details>
          </fieldset>
        ) : null}

        {step === steps.length - 1 ? <fieldset className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
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
                id={item.key}
                className={`${checkboxClass} mt-0.5`}
                {...form.register(item.key)}
              />
              <label htmlFor={item.key} className="text-black">I accept the {item.label}.</label>
            </div>
          ))}
          {form.formState.errors.acceptPrivacy ||
          form.formState.errors.acceptTerms ||
          form.formState.errors.acceptAgreement ? (
            <p role="alert" className="text-xs font-medium text-[#1447e6]">
              Accepting all three documents is required to create an account.
            </p>
          ) : null}
        </fieldset> : null}

        <div className="flex gap-3 pt-1">
          {step > 0 ? <Button variant="secondary" type="button" onClick={() => setStep((current) => current - 1)} className="flex-1">Back</Button> : null}
          <Button variant="auth" type="submit" loading={form.formState.isSubmitting} className="flex-1">
            {step === steps.length - 1 ? "Create account" : "Continue"}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        Already have an account?{" "}
        <Link href={ROUTES.login} className="font-medium text-[#1447e6] hover:underline">
          Sign in
        </Link>
      </p>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
