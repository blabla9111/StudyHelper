// Простое ограничение попыток входа в памяти процесса (достаточно для прототипа).
// При нескольких серверах его нужно заменить на общее хранилище (например, Redis).
interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

const MAX_ENTRIES = 10_000;

function prune(now: number) {
  if (store.size < 500) return;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  // Потолок размера: поток запросов с разными ключами не должен раздувать память. Map хранит порядок вставки, удаляем самые старые.
  if (store.size >= MAX_ENTRIES) {
    let extra = store.size - MAX_ENTRIES + 1;
    for (const k of store.keys()) {
      if (extra-- <= 0) break;
      store.delete(k);
    }
  }
}

export function retryAfterSeconds(key: string, max: number): number {
  const now = Date.now();
  const e = store.get(key);
  if (!e || e.resetAt <= now) return 0;
  return e.count >= max ? Math.ceil((e.resetAt - now) / 1000) : 0;
}

export function registerFailure(key: string, windowMs: number) {
  const now = Date.now();
  prune(now);
  const e = store.get(key);
  if (!e || e.resetAt <= now) store.set(key, { count: 1, resetAt: now + windowMs });
  else e.count += 1;
}

export function clearFailures(key: string) {
  store.delete(key);
}

/**
 * Считает каждое обращение (а не только неудачи). Если лимит уже исчерпан, возвращает число секунд ожидания, иначе 0.
 * Используется для дорогих действий: заявки, запросы записи, PDF, поиск адресатов.
 */
export function hit(key: string, max: number, windowMs: number): number {
  const wait = retryAfterSeconds(key, max);
  if (wait > 0) return wait;
  registerFailure(key, windowMs);
  return 0;
}
