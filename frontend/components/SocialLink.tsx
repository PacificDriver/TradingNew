"use client";

import { useCallback } from "react";
import { apiFetch, authHeaders } from "../lib/api";
import type { SocialBonusState } from "../store/useTradingStore";

type User = {
  id: number;
  email: string;
  demoBalance: number;
  socialBonus?: SocialBonusState;
  [key: string]: unknown;
};

type SocialClickResponse = {
  instagramClicked: boolean;
  telegramClicked: boolean;
  bonusClaimed: boolean;
  credited: boolean;
  demoBalance: number;
};

type Props = {
  href: string;
  platform: "instagram" | "telegram";
  token: string | null;
  user: User | null;
  setAuth: (token: string | null, user: User) => void;
  onCredited?: () => void;
  clicked?: boolean;
  bonusClaimed?: boolean;
  label: string;
  iconPath: string;
  className?: string;
};

export function SocialLink({
  href,
  platform,
  token,
  user,
  setAuth,
  onCredited,
  clicked,
  bonusClaimed,
  label,
  iconPath,
  className
}: Props) {
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (token && user) {
        try {
          const res = await apiFetch<SocialClickResponse>("/bonus/social-click", {
            method: "POST",
            headers: { ...authHeaders(token), "Content-Type": "application/json" },
            body: JSON.stringify({ platform })
          });
          setAuth(token, {
            ...user,
            demoBalance: res.demoBalance,
            socialBonus: {
              instagramClicked: res.instagramClicked,
              telegramClicked: res.telegramClicked,
              bonusClaimed: res.bonusClaimed
            }
          });
          if (res.credited) onCredited?.();
        } catch {
          // open link even if request failed
        }
      }
      window.open(href, "_blank", "noopener,noreferrer");
    },
    [href, platform, token, user, setAuth, onCredited]
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={iconPath} />
      </svg>
      <span>{label}</span>
      {(clicked || bonusClaimed) && (
        <span className="ml-1 text-emerald-400" aria-hidden>✓</span>
      )}
    </a>
  );
}
