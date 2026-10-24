import { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  ruled?: boolean;
  marginLine?: boolean;
  gutter?: "left" | "right" | "center" | "none";
  flush?: boolean;
  stamp?: string;
  stampColor?: "blue" | "red" | "brown";
  children?: ReactNode;
}

/**
 * Archetype L · Ledger Page Folio
 * Ruled accounting parchment with hairlines, margin rule, and gutter shading.
 */
export default function Panel({
  ruled = false,
  marginLine = false,
  gutter = "none",
  flush = false,
  stamp,
  stampColor = "blue",
  children,
  className = "",
  style,
  ...rest
}: PanelProps) {
  const gutterClass =
    gutter === "left"
      ? "shadow-[inset_16px_0_20px_-12px_rgba(58,31,20,0.18)]"
      : gutter === "right"
      ? "shadow-[inset_-16px_0_20px_-12px_rgba(58,31,20,0.18)]"
      : gutter === "center"
      ? "shadow-[inset_12px_0_16px_-10px_rgba(58,31,20,0.15),inset_-12px_0_16px_-10px_rgba(58,31,20,0.15)]"
      : "";

  const stampClass =
    stampColor === "blue"
      ? "text-[#1E3A6B] border-[#1E3A6B]"
      : stampColor === "red"
      ? "text-[#B8371F] border-[#B8371F]"
      : "text-[#3A1F14] border-[#3A1F14]";

  return (
    <div
      className={[
        "relative bg-[#FFF6EE] text-[#3A1F14] border border-[#E8C9B8]",
        "shadow-[0_2px_12px_rgba(58,31,20,0.06)] rounded-[2px]",
        ruled ? "ruled-paper" : "",
        marginLine ? "margin-line pl-6" : "",
        gutterClass,
        flush ? "p-0" : "p-5 sm:p-6",
        className,
      ].join(" ")}
      style={style}
      {...rest}
    >
      {stamp && (
        <div className="absolute top-3 right-3 select-none pointer-events-none">
          <span className={`inked-stamp ${stampClass}`}>{stamp}</span>
        </div>
      )}
      {children}
    </div>
  );
}
