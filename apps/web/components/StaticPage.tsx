import Link from "next/link";

export function StaticPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
      <Link href="/" className="text-sm text-brand hover:underline">
        ← Back to VidGrab
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{title}</h1>
      <div className="prose mt-6 max-w-none text-slate-700 dark:text-slate-300 [&_a]:text-brand [&_h2]:mt-6 [&_h2]:font-semibold [&_p]:mt-3">
        {children}
      </div>
    </main>
  );
}
