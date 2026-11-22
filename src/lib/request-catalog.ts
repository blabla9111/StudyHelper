// Каталог справок и заявлений и подписи статусов. Без серверных зависимостей: нужен и в браузере.

export type RequestStatus = "accepted" | "reviewing" | "signed" | "ready" | "rejected";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  accepted: "Принята",
  reviewing: "Проверяется",
  signed: "Подписана",
  ready: "Готова",
  rejected: "Отклонена",
};

/** Порядок шагов трекера */
export const REQUEST_STEPS: RequestStatus[] = ["accepted", "reviewing", "signed", "ready"];

export type Delivery = "pdf" | "paper";
export const DELIVERY_LABEL: Record<Delivery, string> = { pdf: "Электронный PDF", paper: "Бумажная, в деканате" };

export interface RequestKind {
  id: string;
  title: string;
  category: "certificate" | "statement";
  description: string;
  /** Ситуации, по которым студент ищет эту справку */
  situations: string[];
  /** Срок изготовления в днях */
  days: number;
  /** Сколько дней действует готовая справка (для заявлений не нужно) */
  validDays: number | null;
  /** Подпись поля «куда предоставляется» */
  purposeLabel: string | null;
  purposePrefill?: string;
  purposeRequired?: boolean;
  /** Подпись поля комментария и обязательность */
  noteLabel: string;
  noteRequired?: boolean;
  /** Заявления выдаются в деканате, электронного PDF у них нет */
  pdfAllowed: boolean;
}

export const REQUEST_KINDS: RequestKind[] = [
  {
    id: "study",
    title: "Справка об обучении",
    category: "certificate",
    description: "Подтверждает, что вы учитесь в вузе: курс, форма обучения, срок обучения.",
    situations: ["об обучении", "с места учёбы", "подтверждение обучения", "банк", "аренда жилья", "виза"],
    days: 2,
    validDays: 90,
    purposeLabel: null,
    noteLabel: "Комментарий (необязательно)",
    pdfAllowed: true,
  },
  {
    id: "military",
    title: "Справка в военкомат",
    category: "certificate",
    description: "Для военного комиссариата: подтверждает обучение по очной форме и отсрочку.",
    situations: ["военкомат", "военный комиссариат", "призыв", "отсрочка", "воинский учёт"],
    days: 3,
    validDays: 180,
    purposeLabel: "Куда предоставляется",
    purposePrefill: "Военный комиссариат",
    noteLabel: "Комментарий (необязательно)",
    pdfAllowed: true,
  },
  {
    id: "scholarship",
    title: "Справка для стипендии или соцзащиты",
    category: "certificate",
    description: "Для органов социальной защиты и назначения социальной стипендии или выплат.",
    situations: ["стипендия", "соцзащита", "социальная защита", "социальная стипендия", "выплаты", "льготы"],
    days: 2,
    validDays: 60,
    purposeLabel: "Куда предоставляется",
    purposePrefill: "Орган социальной защиты",
    noteLabel: "Комментарий (необязательно)",
    pdfAllowed: true,
  },
  {
    id: "on_demand",
    title: "Справка по месту требования",
    category: "certificate",
    description: "Если нужна справка для другой организации: укажите, куда она предоставляется.",
    situations: ["по месту требования", "работа", "работодатель", "стажировка", "другая организация", "проезд"],
    days: 2,
    validDays: 90,
    purposeLabel: "Куда предоставляется",
    purposeRequired: true,
    noteLabel: "Комментарий (необязательно)",
    pdfAllowed: true,
  },
  {
    id: "material_aid",
    title: "Заявление на материальную помощь",
    category: "statement",
    description: "Заявление в деканат на выплату материальной помощи. Решение выдаётся в деканате.",
    situations: ["материальная помощь", "деньги", "выплата", "тяжёлая ситуация"],
    days: 5,
    validDays: null,
    purposeLabel: null,
    noteLabel: "Основание (например, многодетная семья)",
    noteRequired: true,
    pdfAllowed: false,
  },
  {
    id: "academic_leave",
    title: "Заявление на академический отпуск",
    category: "statement",
    description: "Заявление о предоставлении академического отпуска. Рассматривается деканатом.",
    situations: ["академический отпуск", "академ", "отпуск по болезни", "перерыв в обучении"],
    days: 7,
    validDays: null,
    purposeLabel: null,
    noteLabel: "Причина и желаемый срок",
    noteRequired: true,
    pdfAllowed: false,
  },
];

export const kindById = (id: string) => REQUEST_KINDS.find((k) => k.id === id);

/** Поиск по ситуации: «справка в военкомат» → «Справка в военкомат». Совпадение по началу слов. */
export function searchKinds(query: string): RequestKind[] {
  const tokens = query
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/)
    .filter((t) => t.length >= 3 && !["справка", "справку", "заявление", "для", "мне", "нужна", "нужно"].includes(t));
  if (tokens.length === 0) return REQUEST_KINDS;
  const scored = REQUEST_KINDS.map((k) => {
    const hay = [k.title, k.description, ...k.situations].join(" ").toLowerCase().replace(/ё/g, "е");
    const words = hay.split(/[^a-zа-я0-9]+/);
    let score = 0;
    for (const t of tokens) {
      const stem = t.length > 5 ? t.slice(0, t.length - 2) : t;
      if (words.some((w) => w.startsWith(stem) || (stem.length >= 5 && stem.startsWith(w.slice(0, 5)) && w.length >= 5))) score += 1;
    }
    return { k, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.k);
}

/** Через сколько месяцев после завершения (готова или отклонена) заявка уходит в архив */
export const ARCHIVE_AFTER_MONTHS = 1;

/** Момент «месяц назад»: заявки, завершённые раньше него, считаются архивными. День месяца не «перепрыгивает» (31 марта → 28 февраля). */
export function archiveCutoff(now = new Date(), months = ARCHIVE_AFTER_MONTHS): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), daysInTarget));
  target.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
  return target.toISOString();
}

/** Архив: заявка обработана (готова или отклонена), и с момента последнего изменения статуса прошёл месяц */
export function isArchivedRequest(status: RequestStatus, updatedAt: string, cutoff: string): boolean {
  return (status === "ready" || status === "rejected") && updatedAt < cutoff;
}
