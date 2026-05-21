import Link from "next/link";

import { RowListQuestionConfig } from "@/app/types/funnel";

interface RowListProps {
  screen: RowListQuestionConfig;
  nextHref: string;
}

export default function RowList({ screen, nextHref }: RowListProps) {
  return (
    <div className="mt-8 space-y-3">
      {screen.componentProps.list.map((option, idx) => (
        <Link
          key={idx + 1}
          href={nextHref}
          className="block w-full px-5 py-4 text-left rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 hover:bg-white/10 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base font-medium shadow-sm hover:shadow-md hover:-translate-y-0.5"
        >
          {option.text}
        </Link>
      ))}
    </div>
  );
}
