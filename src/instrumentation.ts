// Выполняется один раз при старте сервера: предупреждает о небезопасных настройках боевого режима
export function register() {
  if (process.env.NEXT_RUNTIME === "edge" || process.env.NODE_ENV !== "production") return;
  const warn = (text: string) => console.warn(`[StudyHelper] ВНИМАНИЕ: ${text}`);
  if (!process.env.PUBLIC_BASE_URL?.trim()) {
    warn("не задан PUBLIC_BASE_URL. Проверка Origin и QR-коды опираются на заголовки запроса. Укажите настоящий адрес сайта.");
  }
  if (process.env.COOKIE_SECURE === "false") {
    warn("COOKIE_SECURE=false: cookie сессии уходит и по обычному http. На сайте с HTTPS уберите эту настройку.");
  }
  if (process.env.DEMO_MODE === "true") {
    warn("включён DEMO_MODE: на странице входа показаны демо-аккаунты. После конкурса поставьте DEMO_MODE=false.");
  }
  if (process.env.TRUSTED_PROXY_HOPS === "0") {
    warn("TRUSTED_PROXY_HOPS=0: адрес клиента для лимитов не определяется, лимиты общие для всех. Ставьте 1, если перед приложением стоит прокси.");
  }
}
