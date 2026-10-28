interface IconProps {
  className?: string;
}

function StrokeIcon({
  className = "h-5 w-5",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

function FillIcon({
  className = "h-5 w-5",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </StrokeIcon>
  );
}

export function ArrowUpRightIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </StrokeIcon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M5 13l4 4L19 7" />
    </StrokeIcon>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </StrokeIcon>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </StrokeIcon>
  );
}

export function CapIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 4L2 9l10 5 10-5-10-5z" />
      <path d="M6 11.5V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5" />
      <path d="M22 9v5" />
    </StrokeIcon>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" />
      <path d="M4 19a2 2 0 012-2h13" />
    </StrokeIcon>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16" />
      <path d="M16 8h3a1 1 0 011 1v12" />
      <path d="M2 21h20" />
      <path d="M7 7h4" />
      <path d="M7 11h4" />
      <path d="M7 15h4" />
    </StrokeIcon>
  );
}

export function BriefcaseIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8z" />
      <path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2" />
      <path d="M4 13h16" />
    </StrokeIcon>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1" />
      <circle cx="9.5" cy="6.5" r="3.5" />
      <path d="M21 19v-1a4 4 0 00-3-3.87" />
      <path d="M15.5 3.13a3.5 3.5 0 010 6.74" />
    </StrokeIcon>
  );
}

export function FlagIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </StrokeIcon>
  );
}

export function BanknoteIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </StrokeIcon>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <StrokeIcon className={className}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </StrokeIcon>
  );
}

export function QuoteIcon({ className }: IconProps) {
  return (
    <FillIcon className={className}>
      <path d="M9.5 17c-2.2 0-4-1.8-4-4.5V7h6v6H8.2c.2 1.3 1.1 2.2 2.4 2.6l-1.1 1.4zm10 0c-2.2 0-4-1.8-4-4.5V7h6v6h-3.3c.2 1.3 1.1 2.2 2.4 2.6l-1.1 1.4z" />
    </FillIcon>
  );
}

export function XSocialIcon({ className }: IconProps) {
  return (
    <FillIcon className={className}>
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.6 2H8l4.4 5.9L18.9 2zm-1.1 18h1.7L7 3.9H5.2L17.8 20z" />
    </FillIcon>
  );
}

export function LinkedInIcon({ className }: IconProps) {
  return (
    <FillIcon className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.55V9h3.57v11.45z" />
    </FillIcon>
  );
}

export function GitHubIcon({ className }: IconProps) {
  return (
    <FillIcon className={className}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.35.95.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0023.5 12C23.5 5.65 18.35.5 12 .5z" />
    </FillIcon>
  );
}

export function YouTubeIcon({ className }: IconProps) {
  return (
    <FillIcon className={className}>
      <path d="M23 12s0-3.85-.49-5.7a2.9 2.9 0 00-2.05-2.05C18.6 3.75 12 3.75 12 3.75s-6.6 0-8.46.5A2.9 2.9 0 001.5 6.3C1 8.15 1 12 1 12s0 3.85.5 5.7a2.9 2.9 0 002.04 2.05c1.86.5 8.46.5 8.46.5s6.6 0 8.46-.5a2.9 2.9 0 002.05-2.05C23 15.85 23 12 23 12zM9.75 15.5v-7L15.5 12l-5.75 3.5z" />
    </FillIcon>
  );
}
