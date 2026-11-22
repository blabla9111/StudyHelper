import { BRAND } from "@/lib/brand";

export function ConceptStrip() {
  return (
    <div className="bg-slate-900 px-4 py-1.5 text-center text-xs leading-snug text-slate-200 sm:text-xs">
      {BRAND.conceptNote}
    </div>
  );
}
