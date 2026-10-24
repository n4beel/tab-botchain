"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { BOOKMARK_TABS, NavItem } from "@/lib/nav";
import { app } from "@/lib/app-config";

export interface PageShellProps {
  children: ReactNode;
  leftPage?: ReactNode;
  title?: string;
  subtitle?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  nav?: NavItem[];
}

/**
 * Archetype L · Bound Ledger Shell
 *
 * Implements the physical accounting ledger:
 * - Desktop two-page bound folio spread on peach ground with central gutter shadow
 * - Bookmark tabs on the right edge (Ledger, Waiting, New Entry) instead of a top nav bar
 * - Collapses to single page on mobile with back navigation
 * - Prominent limits statement printed directly in the book header
 */
export default function PageShell({
  children,
  leftPage,
  title,
  subtitle,
  description,
  backHref,
  backLabel = "Ledger",
  nav = BOOKMARK_TABS,
}: PageShellProps) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const sub = subtitle || description;

  return (
    <div className="min-h-[100dvh] bg-[#FFE3D3] text-[#3A1F14] flex flex-col justify-between p-3 sm:p-6 md:p-8">
      {/* Book Frame */}
      <div className="mx-auto w-full max-w-[1240px] flex-1 flex flex-col relative">
        {/* Ledger Header Bar / Spine Folio */}
        <header className="mb-3 px-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 no-underline text-[#3A1F14] hover:text-[#B8371F] transition-colors"
            >
              <span className="w-2.5 h-2.5 bg-[#B8371F] rounded-[1px] rotate-45 inline-block group-hover:rotate-90 transition-transform" />
              <span className="font-bold tracking-wider uppercase text-sm sm:text-base font-mono">
                {app.name}
              </span>
              <span className="text-[#7A5646] hidden sm:inline">— Bilateral Ledger</span>
            </Link>

            {/* Mobile Back Affordance */}
            {backHref && (
              <Link
                href={backHref}
                className="md:hidden inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#B8371F] bg-[#FFF6EE] border border-[#E8C9B8] px-2.5 py-1 rounded-[2px]"
              >
                ← {backLabel}
              </Link>
            )}
            {!backHref && !isHome && (
              <Link
                href="/"
                className="md:hidden inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#B8371F] bg-[#FFF6EE] border border-[#E8C9B8] px-2.5 py-1 rounded-[2px]"
              >
                ← Ledger
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            <NetworkBadge />
            <ConnectButton />
          </div>
        </header>

        {/* Ledger Book Spread Container */}
        <div className="relative flex-1 flex flex-col md:flex-row bg-[#FFF6EE] border border-[#E8C9B8] rounded-[4px] shadow-[0_10px_35px_rgba(58,31,20,0.12)] overflow-visible">
          {/* Bookmark Tabs protruding on the Right Edge (Desktop & Tablet) */}
          <nav
            aria-label="Ledger Bookmarks"
            className="absolute -right-3 md:-right-8 top-12 z-20 hidden sm:flex flex-col gap-2"
          >
            {nav.map((item) => {
              const active =
                item.href === "/" ? isHome : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wider no-underline transition-all",
                    "rounded-r-[4px] border border-l-0 shadow-[2px_2px_8px_rgba(58,31,20,0.1)]",
                    active
                      ? "bg-[#B8371F] text-white border-[#942B17] translate-x-1"
                      : "bg-[#FFF6EE] text-[#3A1F14] border-[#E8C9B8] hover:bg-[#FBEBE8] hover:text-[#B8371F]",
                  ].join(" ")}
                >
                  <span className="writing-mode-vertical sm:writing-mode-horizontal">
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={[
                        "ml-1.5 px-1 py-0.2 text-[10px] rounded-full",
                        active ? "bg-white text-[#B8371F]" : "bg-[#B8371F] text-white",
                      ].join(" ")}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Bottom Bookmark Bar */}
          <nav
            aria-label="Mobile Navigation"
            className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFF6EE] border-t border-[#E8C9B8] p-2 flex justify-around shadow-lg"
          >
            {nav.map((item) => {
              const active =
                item.href === "/" ? isHome : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "px-3 py-1.5 text-xs font-mono font-semibold tracking-tight no-underline rounded",
                    active
                      ? "bg-[#B8371F] text-white"
                      : "text-[#3A1F14] hover:bg-[#FBEBE8]",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Left Page (Desktop 38% width with right-side spine gutter) */}
          {leftPage ? (
            <div className="w-full md:w-[38%] border-b md:border-b-0 md:border-r border-[#E8C9B8] shadow-[inset_-16px_0_24px_-14px_rgba(58,31,20,0.16)] flex flex-col p-5 sm:p-7 ruled-paper">
              {leftPage}
            </div>
          ) : null}

          {/* Right Page (or Full Width on single page view) */}
          <div
            className={[
              "flex-1 flex flex-col p-5 sm:p-7 ruled-paper",
              leftPage
                ? "md:w-[62%] shadow-[inset_16px_0_24px_-14px_rgba(58,31,20,0.16)]"
                : "",
            ].join(" ")}
          >
            {/* Page Title & Subtitle if provided */}
            {(title || sub) && (
              <div className="mb-5 border-b border-[#E8C9B8] pb-3">
                {title && (
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#3A1F14]">
                    {title}
                  </h1>
                )}
                {sub && (
                  <p className="text-xs sm:text-sm text-[#7A5646] mt-0.5">
                    {sub}
                  </p>
                )}
              </div>
            )}

            {/* Main Content */}
            <div className="flex-1">{children}</div>
          </div>
        </div>

        {/* Limits & Disclaimer Line (§3.4) */}
        <aside className="mt-4 px-2 text-center text-[11px] sm:text-xs text-[#7A5646] leading-relaxed">
          <p>
            Entries need both sides to agree. Nothing here makes anyone pay. Netting is between two people only.
          </p>
        </aside>
      </div>

      {/* Footer */}
      <footer className="mt-6 pt-4 border-t border-[#E8C9B8] flex flex-wrap items-center justify-between gap-3 text-xs text-[#7A5646] max-w-[1240px] mx-auto w-full">
        <div>
          <span>Tab · {app.tagline}</span>
        </div>
        <BuiltOnBotChain />
      </footer>
    </div>
  );
}
