export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[40vh] px-4">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 rounded-full border-2 border-accent/40 border-t-accent animate-spin"
          aria-hidden
        />
        <p className="text-sm text-slate-500 animate-pulse">Загрузка...</p>
      </div>
    </div>
  );
}
