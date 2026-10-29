import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 border border-brand-600",
  secondary:
    "bg-white text-black border border-neutral-300 hover:border-black focus-visible:outline-brand-600",
  danger: "bg-white text-red-700 border border-red-300 hover:border-red-700 focus-visible:outline-red-700",
  ghost: "bg-transparent text-black hover:bg-neutral-100 border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Icon name="spinner" spin /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  className = "",
  ...rest
}: Omit<ButtonProps, "children" | "icon"> & { label: string; icon: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
