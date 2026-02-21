"use client";

import { useState } from "react";

type Props = { className?: string };

/** Логотип с внешнего хоста — работает локально и на серверах */
const LOGO_SRC = "https://i.postimg.cc/jdY3cVMF/logo-(1).jpg";

function FallbackLogoSvg({ className }: Props) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="chart-logo-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0B90B" />
          <stop offset="100%" stopColor="#F0B90B" />
        </linearGradient>
        <linearGradient id="chart-logo-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0B90B" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="8" fill="url(#chart-logo-glow)" />
      <rect width="36" height="36" rx="8" fill="rgb(15 23 42 / 0.85)" />
      <line x1="12" y1="22" x2="12" y2="10" stroke="url(#chart-logo-gold)" strokeWidth="2" strokeLinecap="round" />
      <rect x="10" y="14" width="4" height="6" rx="0.5" fill="url(#chart-logo-gold)" />
      <path
        d="M16 24 L21 18 L26 20 L32 12"
        stroke="url(#chart-logo-gold)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ChartLogo({ className = "h-9 w-9" }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <FallbackLogoSvg className={className} />;
  }

  return (
    <img
      src={LOGO_SRC}
      alt=""
      width={36}
      height={36}
      className={className}
      aria-hidden
      onError={() => setFailed(true)}
    />
  );
}
