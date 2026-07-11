import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white active:opacity-80",
  secondary: "bg-surface text-text border border-subtle active:opacity-80",
  ghost: "text-subtext active:opacity-70",
};

export function Button({
  variant = "primary",
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      disabled={disabled}
      className={`rounded-full px-5 py-3 text-sm font-medium transition-opacity disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
