import { CONTROL, RESULT, type Label } from "@/lib/labels";
import type { ControlType, FinalResult } from "@/lib/grades";

/** Короткая подпись с полной формой в подсказке и для чтения с экрана */
export function Short({ label }: { label: Label }) {
  if (label.full === label.short) return <>{label.short}</>;
  return (
    <abbr title={label.full} aria-label={label.full} className="no-underline [text-decoration:none]">
      {label.short}
    </abbr>
  );
}

export const ControlName = ({ control }: { control: ControlType }) => <Short label={CONTROL[control]} />;

/** Итог: для зачёта «Зачтено», для остальных «5 · Отлично» (в короткой форме «3 · Удовл.») */
export function ResultName({ control, result }: { control: ControlType; result: FinalResult }) {
  if (control === "credit") return <Short label={RESULT[result.key]} />;
  return (
    <>
      {result.mark} · <Short label={RESULT[result.key]} />
    </>
  );
}
