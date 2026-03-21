"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type PublicContent = {
  privacyPage: string;
};

export default function PrivacyPage() {
  const [text, setText] = useState("Загрузка...");

  useEffect(() => {
    apiFetch<PublicContent>("/public/content")
      .then((data) => setText(data.privacyPage || "Политика пока не заполнена."))
      .catch(() => setText("Не удалось загрузить политику."));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="glass-panel p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-slate-100 mb-4">Политика конфиденциальности</h1>
        <pre className="whitespace-pre-wrap text-sm text-slate-300 font-sans">{text}</pre>
      </div>
    </main>
  );
}
