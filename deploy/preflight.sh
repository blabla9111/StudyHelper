#!/usr/bin/env bash
# Проверка файла .env перед запуском: ничего не меняет, только читает.
#   ./deploy/preflight.sh
set -euo pipefail
source "$(dirname "$0")/_common.sh"

[ -f .env ] || fail "Нет файла .env. Выполните:  cp .env.production.example .env  и поправьте PUBLIC_BASE_URL."

get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '\r' || true; }
problems=0
bad() { echo "  ✗ $1"; problems=$((problems + 1)); }
good() { echo "  ✓ $1"; }

url="$(get PUBLIC_BASE_URL)"
if [[ "$url" =~ ^https://[a-zA-Z0-9.-]+$ ]] && [[ "$url" != *example* ]]; then
  good "PUBLIC_BASE_URL = $url"
else
  bad "PUBLIC_BASE_URL должен быть настоящим адресом вида https://ваш-домен (без слэша в конце), сейчас: '${url}'"
fi

[ "$(get COOKIE_SECURE)" = "true" ] && good "COOKIE_SECURE = true" || bad "COOKIE_SECURE должен быть true (сайт работает по HTTPS)"

demo="$(get DEMO_MODE)"
case "$demo" in
  true)  good "DEMO_MODE = true (конкурсный стенд: демо-аккаунты видны на входе)" ;;
  false) good "DEMO_MODE = false (демо-аккаунты скрыты)" ;;
  *)     bad "DEMO_MODE должен быть true или false, сейчас: '${demo}'" ;;
esac

allow="$(get ALLOW_DEMO_SEED)"
if [ "$demo" = "true" ]; then
  [ "$allow" = "true" ] && good "ALLOW_DEMO_SEED = true (демо-данные создаются на пустой базе)" \
    || bad "при DEMO_MODE=true нужна строка ALLOW_DEMO_SEED=true, иначе пустая база останется без аккаунтов"
elif [ "$allow" = "true" ]; then
  bad "при DEMO_MODE=false уберите ALLOW_DEMO_SEED=true: иначе повышение версии демо-данных сотрёт базу и вернёт демо-пароли"
fi

hops="$(get TRUSTED_PROXY_HOPS)"
[ "$hops" = "1" ] && good "TRUSTED_PROXY_HOPS = 1 (один прокси: Caddy)" \
  || bad "TRUSTED_PROXY_HOPS должен быть 1 (перед приложением один прокси), сейчас: '${hops:-не задан}'"

perms="$(stat -c '%a' .env)"
[ "$perms" = "600" ] && good "права на .env: 600" || bad "права на .env: $perms, выполните  chmod 600 .env"

if [ "$problems" -gt 0 ]; then
  fail "Найдено проблем: $problems. Исправьте .env и запустите проверку снова."
fi
echo "Файл .env в порядке."
