import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center mt-16">
      <div className="card max-w-xl w-full text-center animate-fade-in-up stagger-1 opacity-0">
        <h1 className="font-display text-2xl font-semibold mb-2">
          Бинарные опционы · Демо‑MVP
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Минимальная платформа бинарных опционов в формате MVP.{" "}
          <span className="font-semibold text-slate-200">
            Все котировки, открытие/закрытие сделок и расчёты исполняются на
            бэкенде.
          </span>{" "}
          Клиент только отображает UI и подписывается на обновления в
          реальном времени.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/register" className="btn-primary w-full sm:w-auto transition-transform hover:scale-[1.02] active:scale-[0.98]">
            Создать демо‑аккаунт
          </Link>
          <Link
            href="/login"
            className="btn-outline w-full sm:w-auto border-slate-700 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Уже есть аккаунт
          </Link>
        </div>
      </div>
    </div>
  );
}

