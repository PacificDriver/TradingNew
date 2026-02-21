"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

/**
 * Оборачивает контент страницы и запускает плавное появление при смене маршрута.
 * Использует только transform + opacity для GPU-ускорения.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="animate-page-enter flex flex-1 flex-col min-h-0 w-full"
      style={{ opacity: 0 }}
    >
      {children}
    </div>
  );
}
