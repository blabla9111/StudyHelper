// Собственный логотип StudyHelper: раскрытая книга и искра знаний. Не копирует символику вуза.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#2744d6" />
      <path
        d="M7.5 11.2c2.6-1.3 5.2-1.3 8.5.8 3.3-2.1 5.9-2.1 8.5-.8v10.3c-2.6-1.3-5.2-1.3-8.5.8-3.3-2.1-5.9-2.1-8.5-.8z"
        fill="#fff"
      />
      <path d="M16 12v10.3" stroke="#2744d6" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="24.6" cy="7.4" r="2.2" fill="#ffd166" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
        Study<span className={light ? "text-brand-200" : "text-brand-600"}>Helper</span>
      </span>
    </span>
  );
}
