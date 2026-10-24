"use client";

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost" | "stamp" | "danger" | "slab";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  busy?: boolean;
  icon?: ReactNode;
}

/**
 * Archetype L · Ledger Inked Action Button
 * Crisp bookkeeping button with ink-red fills, parchment outlines, and stamped seals.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      busy = false,
      icon,
      disabled,
      children,
      className = "",
      ...rest
    },
    ref
  ) => {
    const isBusy = loading || busy;
    const isDisabled = disabled || isBusy;

    const baseClasses =
      "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-all select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

    const sizeClasses =
      size === "sm"
        ? "px-3 py-1 text-xs"
        : size === "lg"
        ? "px-6 py-3 text-base"
        : "px-4 py-2 text-sm";

    let variantClasses = "";
    if (variant === "primary" || variant === "slab") {
      variantClasses =
        "bg-[#B8371F] text-white border border-[#942B17] hover:bg-[#A32E19] active:translate-y-[1px] shadow-[0_1px_3px_rgba(58,31,20,0.15)]";
    } else if (variant === "ghost") {
      variantClasses =
        "bg-transparent text-[#3A1F14] border border-[#E8C9B8] hover:bg-[#FCEEE3] active:bg-[#F5DFD0]";
    } else if (variant === "stamp") {
      variantClasses =
        "bg-transparent text-[#1E3A6B] border-2 border-[#1E3A6B] font-mono uppercase tracking-wider hover:bg-[#EBF1FA]";
    } else if (variant === "danger") {
      variantClasses =
        "bg-transparent text-[#B8371F] border border-[#B8371F] hover:bg-[#FBEBE8]";
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[baseClasses, sizeClasses, variantClasses, className].join(" ")}
        {...rest}
      >
        {isBusy ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </span>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
