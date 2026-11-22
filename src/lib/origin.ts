// Защита от CSRF для POST-запросов: заголовок Origin должен совпадать с адресом сайта.
// Если задан PUBLIC_BASE_URL, сравниваем только с ним: заголовки Host и X-Forwarded-Host не доверяем, пока их не перезаписывает прокси.
export function expectedHost(req: Request): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      return new URL(base).host;
    } catch {
      /* неверный адрес в настройках: возвращаемся к заголовкам */
    }
  }
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host");
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = expectedHost(req);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Адрес клиента для лимитов. X-Forwarded-For дописывают прокси, поэтому первый элемент задаёт сам клиент и ему верить нельзя.
 * Берём элемент, который добавил ближайший доверенный прокси: считаем с конца цепочки (TRUSTED_PROXY_HOPS, по умолчанию 1).
 * Прокси должен перезаписывать заголовок (nginx: proxy_set_header X-Forwarded-For $remote_addr; Caddy делает это сам).
 */
export function clientIp(req: Request): string {
  const hopsRaw = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  const hops = Number.isInteger(hopsRaw) && hopsRaw >= 0 ? hopsRaw : 1;
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (hops > 0 ? parts[parts.length - hops] : undefined) || "local";
}
