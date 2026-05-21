import { QuestionConfig, QuestionType } from "@/app/types/funnel";

import EmailForm from "./EmailForm";
import RowList from "./RowList";

interface ScreenRendererProps {
  screen: QuestionConfig;
  nextHref: string;
  prevHref: string | null;
}

export default function ScreenRenderer({
  screen,
  nextHref,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  prevHref: _prevHref,
}: ScreenRendererProps) {
  return (
    <div className="mt-4">
      <h1
        className={`font-extrabold tracking-tight ${screen.title.tailwindcss || ""}`}
      >
        {screen.title.text}
      </h1>

      {screen.type === QuestionType.rowList && (
        <RowList screen={screen} nextHref={nextHref} />
      )}
      {screen.type === QuestionType.email && (
        <EmailForm screen={screen} nextHref={nextHref} />
      )}
    </div>
  );
}
