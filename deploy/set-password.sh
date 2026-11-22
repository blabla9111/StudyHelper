#!/usr/bin/env bash
# Смена пароля пользователя на работающем сайте (после конкурса: см. DEPLOY.md, «После конкурса»).
#   ./deploy/set-password.sh student1
# Пароль вводится скрыто, нигде не сохраняется и не печатается. Минимум 12 символов.
set -euo pipefail
source "$(dirname "$0")/_common.sh"

login="${1:-}"
[ -n "$login" ] || fail "Укажите логин:  ./deploy/set-password.sh student1"
app_running || fail "Контейнер не запущен."

read -rsp "Новый пароль для $login (не короче 12 символов): " p1; echo
read -rsp "Повторите пароль: " p2; echo
[ "$p1" = "$p2" ] || fail "Пароли не совпали, ничего не изменено."

printf '%s' "$p1" | docker compose exec -T app node deploy/set-password.mjs "$login"
