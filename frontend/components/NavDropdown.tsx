"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const HOVER_CLOSE_DELAY = 120;

export type DropdownItem = {
  href: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
};

type NavDropdownProps = {
  label: string;
  items: DropdownItem[];
  /** Если задан, клик по надписи ведёт на этот URL (торговля → /trade) */
  labelHref?: string;
  align?: "left" | "right";
  className?: string;
};

export function NavDropdown({ label, items, labelHref, align = "left", className = "" }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const isActive = pathname === labelHref || items.some((item) => pathname === item.href);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleEnter = () => {
    clearCloseTimeout();
    setOpen(true);
  };

  const handleLeave = () => {
    closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  };

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const linkClass = `inline-flex items-center gap-1.5 py-2 text-sm font-medium transition-colors outline-none ${
    isActive ? "text-slate-100" : "text-slate-400 hover:text-slate-100"
  }`;

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className="inline-flex items-center">
        {labelHref ? (
          <Link href={labelHref} className={linkClass}>
            {label}
          </Link>
        ) : (
          <span className={linkClass}>{label}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`p-2 -ml-1 text-slate-400 hover:text-slate-100 transition-colors outline-none ${open ? "text-slate-100" : ""}`}
          aria-label="Открыть меню"
        >
          <svg
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className={`absolute top-full z-[100] pt-1 left-0 ${align === "right" ? "right-0 left-auto" : ""}`}
          style={{ marginTop: "-2px" }}
        >
          <div className="min-w-[200px] overflow-hidden rounded-lg glass-strong py-1 shadow-xl shadow-black/20">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-slate-800/80 ${
                    active ? "bg-slate-800/60 text-slate-100" : "text-slate-300"
                  }`}
                >
                  {item.icon && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                      {item.icon}
                    </span>
                  )}
                  <div className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    {item.description && (
                      <span className="block text-xs text-slate-500 mt-0.5">{item.description}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
