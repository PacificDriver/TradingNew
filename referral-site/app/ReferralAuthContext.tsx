"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { referralApiFetch, setReferralToken } from "../lib/referralApi";

type Partner = {
  id: number;
  email: string;
  name: string | null;
  referralCode: string;
  referralClicks?: number;
};

type ReferralAuthContextType = {
  partner: Partner | null;
  loading: boolean;
  setPartner: (p: Partner | null) => void;
  logout: () => Promise<void>;
};

const ReferralAuthContext = createContext<ReferralAuthContextType | null>(null);

export function useReferralAuth() {
  const ctx = useContext(ReferralAuthContext);
  if (!ctx) throw new Error("useReferralAuth must be used within ReferralAuthProvider");
  return ctx;
}

export function ReferralAuthProvider({ children }: { children: ReactNode }) {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const logout = useCallback(async () => {
    try {
      await referralApiFetch("/referral-partners/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setReferralToken(null);
    setPartner(null);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    referralApiFetch<Partner | null>("/referral-partners/me")
      .then((data) => {
        if (!cancelled && data) setPartner(data);
      })
      .catch(() => {
        if (!cancelled) setPartner(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <ReferralAuthContext.Provider value={{ partner, loading, setPartner, logout }}>
      {children}
    </ReferralAuthContext.Provider>
  );
}
