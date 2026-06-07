import { QuestionConfig, QuestionType } from "@/app/types/funnel";

import EmailForm from "./EmailForm";
import RowList from "./RowList";
import { VoiceInput } from "./VoiceInput";

interface ScreenRendererProps {
  screen: QuestionConfig;
  nextHref: string;
  prevHref: string | null;
}

export default function ScreenRenderer({ screen, nextHref }: ScreenRendererProps) {
  const subtitle = screen.subtitle;

  return (
    <>
      <h1 className="glass-heading mb-2.5">{screen.title.text}</h1>
      {subtitle ? (
        <p className="glass-sub mb-8">{subtitle.text}</p>
      ) : (
        <div className="mb-8" />
      )}

      {screen.type === QuestionType.rowList && (
        <RowList screen={screen} nextHref={nextHref} />
      )}
      {screen.type === QuestionType.email && (
        <EmailForm screen={screen} nextHref={nextHref} />
      )}
      {screen.type === QuestionType.voice && (
        <VoiceInput screen={screen} nextHref={nextHref} />
      )}
    </>
  );
}
