import { notFound } from "next/navigation";
import Link from "next/link";
import { funnelsConfig } from "@/app/config/funnels";
import { QuestionType } from "@/app/types/funnel";

export default async function FunnelLandingPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) {
    notFound();
  }

  // Get the first screen config (the quiz question)
  const screen = config.screens[0];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300 hover:shadow-indigo-500/10">
        {screen && (
          <div className="mt-4">
            <h1
              className={`font-extrabold tracking-tight ${screen.title.tailwindcss || ""}`}
            >
              {screen.title.text}
            </h1>

            {screen.type === QuestionType.rowList && screen.componentProps?.list && (
              <div className="mt-8 space-y-3">
                {screen.componentProps.list.map((option: { id: string | number; text: string }) => (
                  <Link
                    key={option.id}
                    href={`/${funnelId}/email`}
                    className="block w-full px-5 py-4 text-left rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 hover:bg-white/10 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base font-medium shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  >
                    {option.text}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
