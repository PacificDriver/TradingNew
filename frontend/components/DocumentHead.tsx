"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "../lib/i18n";

/**
 * Обновляет document.title и meta description по текущему пути и выбранному языку.
 * Вызывается внутри LocaleProvider.
 */
export function DocumentHead() {
  const pathname = usePathname();
  const { t } = useLocale();

  useEffect(() => {
    const route = pathname?.replace(/\/$/, "") || "/";
    const titleKey = getTitleKey(route);
    const descKey = getDescriptionKey(route);
    const title = titleKey ? t(titleKey) : t("seo.title.home");
    const description = descKey ? t(descKey) : t("seo.defaultDescription");
    const siteName = t("seo.siteName");

    document.title = `${title} | ${siteName}`;

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", description);
  }, [pathname, t]);

  return null;
}

function getTitleKey(route: string): string | null {
  const map: Record<string, string> = {
    "/": "seo.title.home",
    "/trade": "seo.title.trade",
    "/login": "seo.title.login",
    "/register": "seo.title.register",
    "/forgot-password": "seo.title.forgotPassword",
    "/reset-password": "seo.title.resetPassword",
    "/profile": "seo.title.profile",
    "/deposit": "seo.title.deposit",
    "/pairs": "seo.title.pairs",
    "/support": "seo.title.support",
    "/invest": "seo.title.invest",
    "/admin": "seo.title.admin",
    "/admin/support": "seo.title.adminSupport"
  };
  return map[route] ?? "seo.title.home";
}

function getDescriptionKey(route: string): string | null {
  const map: Record<string, string> = {
    "/": "seo.description.home",
    "/trade": "seo.description.trade",
    "/login": "seo.description.login",
    "/register": "seo.description.register",
    "/forgot-password": "seo.description.forgotPassword",
    "/reset-password": "seo.description.resetPassword",
    "/profile": "seo.description.profile",
    "/deposit": "seo.description.deposit",
    "/pairs": "seo.description.pairs",
    "/support": "seo.description.support",
    "/invest": "seo.description.invest",
    "/admin": "seo.description.admin",
    "/admin/support": "seo.description.adminSupport"
  };
  return map[route] ?? "seo.description.home";
}
