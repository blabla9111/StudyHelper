# Выкладка StudyHelper на сервер: инструкция «с нуля»

Схема: интернет → **Caddy** (HTTPS, порты 80/443) → **контейнер с приложением** (только `127.0.0.1:3000`) → том `studyhelper-data` с базой SQLite.

Где выполнять команду, указано в заголовке блока: **«на моём компьютере (PowerShell)»** или **«на сервере (по SSH)»**.

> Версия инструкции написана для Ubuntu 22.04/24.04 и Debian 12. Какая система у вас, покажет команда `cat /etc/os-release` (шаг 1). Если система другая, пришлите вывод, команды поправим.

## Что понадобится

- VPS: 1 процессор, **2 ГБ памяти** (при 1 ГБ сборка может не уместиться, см. «Частые ошибки»), 15 ГБ диска.
- **Домен** и возможность создать у регистратора A-запись на IP сервера. Без домена нормального HTTPS-сертификата не будет, браузер жюри покажет предупреждение.
- Файл проекта `studyhelper.zip` (без `node_modules`, `.next`, `data`, `.env`).
- Никакие пароли и ключи в чат и в проект не вставляются. Приватный SSH-ключ (файл `id_ed25519` без `.pub`) никому не отправляется.

---

## Шаг 1 из 11. Вход на сервер по SSH-ключу

**На моём компьютере (PowerShell):**

```powershell
ssh -V
ssh-keygen -t ed25519 -C "studyhelper"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Последняя команда печатает **публичный** ключ (одна строка `ssh-ed25519 AAAA…`). Его можно вставить в панели провайдера при создании сервера (лучший вариант) или добавить на уже созданный сервер:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP_СЕРВЕРА "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

(один раз спросит пароль root от провайдера). Затем:

```powershell
ssh root@IP_СЕРВЕРА
```

**Как проверить:** вы на сервере и пароль уже не спрашивают (только парольную фразу ключа, если задали). На сервере выполните `cat /etc/os-release` и запомните систему.

## Шаг 2 из 11. Обновление системы

**На сервере (по SSH):**

```bash
apt update && apt upgrade -y
ls /var/run/reboot-required
```

Если последняя команда вывела имя файла, перезагрузите: `reboot`, подождите минуту и войдите снова.

**Как проверить:** `apt list --upgradable` пишет почти пусто.

## Шаг 3 из 11. Пользователь без root

Дальше работаем не под root, а под пользователем `deploy`.

**На сервере (по SSH, под root):**

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy && visudo -c
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

**Как проверить (откройте НОВОЕ окно PowerShell, старое не закрывайте):**

```powershell
ssh deploy@IP_СЕРВЕРА
sudo whoami
```

Должно напечатать `root` (то есть sudo работает). Пока это не получилось, к шагу 4 не переходите.

Риск: `NOPASSWD` значит, что любой, у кого есть ваш ключ, получает полные права. Поэтому приватный ключ хранится только у вас.

## Шаг 4 из 11. Запрет входа по паролю и под root

Делайте только после того, как шаг 3 проверен. Иначе можно закрыть себе доступ.

**На сервере (по SSH, под deploy):**

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/00-hardening.conf
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication)'
```

(Файл назван `00-…`, чтобы он читался раньше настроек провайдера: побеждает первое найденное значение.)

**Как проверить:** последняя команда показывает `no` во всех трёх строках. В **новом** окне PowerShell `ssh deploy@IP_СЕРВЕРА` работает, а `ssh root@IP_СЕРВЕРА` отвечает `Permission denied`. Старое окно закрывайте только после этого.

## Шаг 5 из 11. Брандмауэр: открыты только 22, 80, 443

Риск: неверное правило может отрезать вас от сервера. Сначала разрешаем 22, потом включаем, старое окно SSH держим открытым.

**На сервере (по SSH):**

```bash
sudo apt install -y ufw
sudo ss -tlnp | grep sshd
```

Если SSH слушает не порт 22, замените 22 в команде ниже на ваш порт.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

**Как проверить:** в статусе только 22, 80, 443 (tcp). В новом окне `ssh deploy@IP_СЕРВЕРА` по-прежнему входит. Порт приложения 3000 открывать не нужно и нельзя: он привязан к `127.0.0.1`.

## Шаг 6 из 11. Установка Docker

**На сервере (по SSH).** Для Ubuntu (для Debian замените `ubuntu` на `debian` в двух местах):

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy
```

Выйдите и войдите снова (`exit`, затем `ssh deploy@IP_СЕРВЕРА`), чтобы права группы `docker` заработали.

**Как проверить:**

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Последняя команда должна написать «Hello from Docker!». Если она зависает или ругается на скачивание, значит Docker Hub с сервера недоступен: пришлите вывод, подберём зеркало (в проекте для этого есть переменная `NODE_IMAGE`).

Замечание: членство в группе `docker` почти равно правам root. Это нормально для одного администратора.

## Шаг 7 из 11. Загрузка проекта

**На моём компьютере (PowerShell)**, из папки, где лежит `studyhelper.zip`:

```powershell
scp .\studyhelper.zip deploy@IP_СЕРВЕРА:/home/deploy/
```

**На сервере (по SSH):**

```bash
sudo apt install -y unzip
mkdir -p ~/studyhelper
unzip -o ~/studyhelper.zip -d ~/studyhelper
cd ~/studyhelper
chmod +x deploy/*.sh
ls Dockerfile docker-compose.yml assets/fonts assets/demo-certificate.pdf
```

**Как проверить:** `ls` показывает все четыре пути без ошибки «No such file». Дальше все команды выполняются в `~/studyhelper`.

Проект грузим архивом, а не через git: в `.gitignore` проекта указан `assets/demo-certificate.pdf`, и при выкладке через git запасная справка потерялась бы.

## Шаг 8 из 11. Настройки (.env)

**На сервере (по SSH), в `~/studyhelper`:**

```bash
cp .env.production.example .env
chmod 600 .env
nano .env
```

В `nano` замените `https://studyhelper.example.ru` на свой адрес (с `https://`, без слэша в конце). `DEMO_MODE=true`, `ALLOW_DEMO_SEED=true`, `COOKIE_SECURE=true` и `TRUSTED_PROXY_HOPS=1` оставьте как есть. Без `ALLOW_DEMO_SEED=true` приложение в боевом режиме не создаст демо-аккаунты, и войти будет некому. Сохранить: `Ctrl+O`, `Enter`, выйти: `Ctrl+X`.

```bash
./deploy/preflight.sh
```

**Как проверить:** все строки с `✓` и в конце «Файл .env в порядке».

## Шаг 9 из 11. Сборка и запуск приложения

**На сервере (по SSH), в `~/studyhelper`:**

```bash
docker compose build
docker compose up -d
docker compose ps
```

Сборка занимает несколько минут. При первом запуске сайт сам заполнит пустую базу демо-данными (в логе строка `[seed] Готово`; это работает только при `ALLOW_DEMO_SEED=true` в `.env`).

**Как проверить:**

```bash
docker compose ps                      # статус: Up ... (healthy), через 40-60 секунд
curl -sI http://127.0.0.1:3000/login   # первая строка: HTTP/1.1 200 OK
docker compose logs --tail 30
```

Если что-то не так: пришлите вывод `docker compose logs --tail 100` и `docker compose ps`.

## Шаг 10 из 11. Домен и HTTPS (Caddy)

1. **У регистратора домена** создайте A-запись: имя домена → IP сервера. Подождите несколько минут.
2. **На моём компьютере (PowerShell):** `nslookup ВАШ.ДОМЕН` должен показать IP сервера. Пока он другой, дальше не идите: Let's Encrypt ограничивает число неудачных попыток.
3. **На сервере (по SSH)**, установка Caddy по инструкции разработчиков:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

4. **На сервере (по SSH), в `~/studyhelper`:** подставьте свой домен и включите конфиг.

```bash
sed -i 's/studyhelper.example.ru/ВАШ.ДОМЕН/' deploy/Caddyfile
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy --no-pager -n 30
```

**Как проверить:** в журнале есть строка про получение сертификата (`certificate obtained successfully`). В браузере на компьютере и на телефоне (по мобильному интернету, не по домашнему Wi-Fi) откройте `https://ВАШ.ДОМЕН`: замочек есть, предупреждений нет. Дальше полный чек-лист: `deploy/CHECKLIST.md`.

Что делает конфиг (`deploy/Caddyfile`): передаёт приложению исходный `Host` и `X-Forwarded-Host`/`X-Forwarded-Proto` (без этого все POST отклонятся защитой от CSRF) и **перезаписывает** `X-Forwarded-For` настоящим IP клиента (иначе ограничение попыток входа обходится подменой заголовка).

## Шаг 11 из 11. Копии базы по расписанию

**На сервере (по SSH), в `~/studyhelper`:**

```bash
./deploy/backup.sh
./deploy/restore-check.sh
crontab -e
```

В `crontab -e` добавьте одну строку (каждые 6 часов), путь замените на свой, если папка другая:

```
17 */6 * * * /home/deploy/studyhelper/deploy/backup.sh >> /home/deploy/studyhelper/backups/backup.log 2>&1
```

**Как проверить:** `./deploy/backup.sh` печатает «Копия сохранена» и `integrity_check ok`; `./deploy/restore-check.sh` печатает `seed_version=…`; `crontab -l` показывает строку. Через 6 часов в `backups/` появится новая копия.

---

# Резервные копии и восстановление

**Почему не просто скопировать файл.** База работает в режиме WAL: часть данных лежит в файле `studyhelper.db-wal`. Копия одного `.db` при работающем сайте может оказаться неполной или битой. Скрипт использует официальный механизм SQLite (`backup`): копия согласованная, проверяется `integrity_check`, хранится 14 дней (`KEEP_DAYS`), сжата `gzip`.

| Что сделать | Команда (на сервере, в `~/studyhelper`) |
|---|---|
| Сделать копию сейчас | `./deploy/backup.sh` |
| Проверить последнюю копию (живую базу не трогает) | `./deploy/restore-check.sh` |
| Проверить конкретную копию | `./deploy/restore-check.sh backups/ФАЙЛ.db.gz` |
| Восстановить базу из копии (заменяет текущую, спросит «ДА») | `./deploy/restore.sh backups/ФАЙЛ.db.gz` |

Перед восстановлением скрипт сам снимает копию текущей базы (`…-before-restore.db.gz`) и отказывается восстанавливать копию с другой версией демо-данных (иначе при запуске сайт пересоздал бы базу).

**Копии должны жить не только на сервере.** Если сервер пропадёт, пропадут и копии. Раз в день-два забирайте их к себе.

**На моём компьютере (PowerShell):**

```powershell
mkdir backups -ErrorAction SilentlyContinue
scp "deploy@IP_СЕРВЕРА:/home/deploy/studyhelper/backups/*.db.gz" .\backups\
```

# Обновление за 5 минут

Данные лежат в томе `studyhelper-data` и при обновлении образа не теряются. **Исключение:** если в новой версии выросла `SEED_VERSION` в `scripts/seed.ts`, то при запуске база пересоздаётся. Скрипт обновления это замечает, заранее делает копию и просит ввести «ДА».

**Важно: новую версию нельзя распаковывать поверх старой папки.** В новых версиях файлы удаляются или переименовываются (например, удалён маршрут `api/requests/advance`), а `unzip` поверх оставит старые файлы, и они попадут в сборку. Поэтому новая версия кладётся в **новую папку**, к ней переносятся `.env` и `backups`, а старая папка остаётся на случай отката.

**На моём компьютере (PowerShell).** Архив новой версии не должен содержать `.env`, `node_modules`, `.next`, `data`, `backups`, `.git`. Если делаете архив сами, из папки проекта:

```powershell
tar -a -c -f ..\studyhelper-update.zip --exclude node_modules --exclude .next --exclude data --exclude backups --exclude .env --exclude .git .
scp ..\studyhelper-update.zip deploy@IP_СЕРВЕРА:/home/deploy/
```

**На сервере (по SSH):**

```bash
# 1. Копия базы силами старой версии (на случай любых неожиданностей)
cd ~/studyhelper && ./deploy/backup.sh before-update

# 2. Новая версия в новую папку, перенос .env и копий
cd ~
rm -rf studyhelper-new && mkdir studyhelper-new
unzip -q studyhelper-update.zip -d studyhelper-new
cp -p studyhelper/.env studyhelper-new/.env
mkdir -p studyhelper-new/backups && cp -a studyhelper/backups/. studyhelper-new/backups/

# 3. Новые настройки (один раз; уже существующие строки не дублируются)
cd ~/studyhelper-new
grep -q '^ALLOW_DEMO_SEED=' .env || echo 'ALLOW_DEMO_SEED=true' >> .env
grep -q '^TRUSTED_PROXY_HOPS=' .env || echo 'TRUSTED_PROXY_HOPS=1' >> .env

# 4. Подмена папки: старая сохраняется как studyhelper-old
cd ~
rm -rf studyhelper-old && mv studyhelper studyhelper-old && mv studyhelper-new studyhelper

# 5. Выкладка
cd ~/studyhelper
chmod +x deploy/*.sh
./deploy/update.sh
```

Скрипт по шагам: проверка `.env`, копия базы, сравнение версии демо-данных, сборка (прошлый образ сохраняется как `studyhelper:previous`), запуск, ожидание `healthy`.

**Как проверить:** `docker compose ps` показывает `healthy`; пройдите раздел «После обновления» в `deploy/CHECKLIST.md`.

Папку `~/studyhelper-old` можно удалить (`rm -rf ~/studyhelper-old`) после того, как убедитесь, что всё работает; копии базы хранятся в `~/studyhelper/backups`.

Чего не делать: `npm run seed` на сервере (стирает всю базу).

# Откат на прошлую версию

**На сервере (по SSH), в `~/studyhelper`:**

```bash
./deploy/rollback.sh
```

Одна команда: снимает копию базы, ставит образ `studyhelper:previous` обратно и ждёт `healthy`. Откатывается только код (образ), база остаётся как есть. Новая версия добавляет в базу колонку и таблицу журнала; прошлая версия их просто не использует, так что данные после отката читаются. Исходники прошлой версии лежат в `~/studyhelper-old`. Если у прошлой версии другая версия демо-данных, скрипт предупредит, что база будет пересоздана; тогда данные возвращаются командой `./deploy/restore.sh backups/ФАЙЛ-перед-обновлением.db.gz`.

# После конкурса

1. **Выключить показ демо-аккаунтов.** В `.env` поставить `DEMO_MODE=false` и **удалить строку `ALLOW_DEMO_SEED=true`** (иначе скрипт `preflight.sh` откажется продолжать: с этой строкой любое повышение версии демо-данных сотрёт базу и вернёт демо-пароли), затем:

```bash
nano .env
docker compose up -d --force-recreate
```

(`restart` не перечитывает `.env`, нужен именно `up -d --force-recreate`.)

2. **Сменить пароли.** `DEMO_MODE=false` лишь прячет учётные данные со страницы входа. Пять демо-аккаунтов и их пароли остаются рабочими и **опубликованы в README и в коде**, значит, их знает любой, кто видел проект. Остальные пользователи в базе заблокированы случайным паролем. На сервере для каждого из пяти логинов:

```bash
./deploy/set-password.sh student1
./deploy/set-password.sh student2
./deploy/set-password.sh teacher1
./deploy/set-password.sh teacher2
./deploy/set-password.sh dean1
```

Пароль вводится скрыто, минимум 12 символов; старые входы этого пользователя завершаются. Новые пароли храните в менеджере паролей. ВАЖНО: `npm run seed`, а также повышение `SEED_VERSION` вернут демо-пароли.

3. Если сайт больше не нужен: `docker compose down` (том с базой сохранится) и удалите A-запись домена. Удаление тома (`docker volume rm studyhelper-data`) стирает базу: только после копии и только если уверены.

# Без Docker (запасной вариант)

Если Docker поставить не получилось. Требования те же: Node 22, один процесс, Caddy перед ним, база вне папки проекта.

**На сервере (по SSH):**

```bash
# Node 22 из репозитория NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v

sudo useradd --system --home /opt/studyhelper --shell /usr/sbin/nologin studyhelper
sudo mkdir -p /opt/studyhelper/app /var/lib/studyhelper
sudo unzip -o ~/studyhelper.zip -d /opt/studyhelper/app
sudo cp /opt/studyhelper/app/.env.production.example /opt/studyhelper/.env
sudo nano /opt/studyhelper/.env              # PUBLIC_BASE_URL
sudo chmod 600 /opt/studyhelper/.env
sudo chown -R studyhelper:studyhelper /opt/studyhelper /var/lib/studyhelper
cd /opt/studyhelper/app
sudo -u studyhelper npm ci
sudo -u studyhelper npm run build
sudo cp deploy/systemd/studyhelper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now studyhelper
systemctl status studyhelper --no-pager
curl -sI http://127.0.0.1:3000/login
```

Caddy настраивается как в шаге 10. Копия базы без Docker:
`sudo -u studyhelper env DATABASE_PATH=/var/lib/studyhelper/studyhelper.db node deploy/backup-db.mjs /tmp/copy.db`
(скрипты `backup.sh`, `update.sh`, `rollback.sh` рассчитаны на Docker). Пароль без Docker: `printf %s 'НовыйПароль-12+' | sudo -u studyhelper env DATABASE_PATH=/var/lib/studyhelper/studyhelper.db node deploy/set-password.mjs student1` (команда попадёт в историю оболочки, поэтому лучше с Docker-скриптом).

# Частые ошибки

Во всех случаях сначала соберите факты:

```bash
docker compose ps
docker compose logs --tail 100
```

| Симптом | Вероятная причина и что делать |
|---|---|
| Сборка обрывается словом `Killed` | Не хватило памяти. Добавьте файл подкачки: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab`, повторите `docker compose build`. |
| Ошибка при скачивании `node:22-bookworm-slim` | Docker Hub недоступен с сервера. Пришлите вывод; решение: зеркало в `NODE_IMAGE` (`.env`) или сборка на другом компьютере. |
| При входе «Запрос отклонён» (403), все POST не проходят | Прокси не передаёт исходный `Host`/`X-Forwarded-Host` или вы открываете сайт не по домену из Caddyfile. Проверьте `deploy/Caddyfile` и адрес в браузере. |
| Вход «проходит», но тут же выкидывает на страницу входа | `COOKIE_SECURE=true`, а сайт открыт по `http://`. Открывайте по `https://`. |
| QR в справке ведёт на неверный адрес или `localhost` | Не задан или неверен `PUBLIC_BASE_URL`. Исправьте `.env`, затем `docker compose up -d --force-recreate`, скачайте справку заново. |
| В имени файла справки `-obrazets` | Не собралась настоящая PDF-справка, отдан запасной образец. Смотрите `docker compose logs` на строку `[pdf]`. |
| Браузер: «подключение не защищено» | Сертификат не выдан: DNS не указывает на сервер или закрыты порты 80/443. `sudo journalctl -u caddy -n 50`, `sudo ufw status`. |
| Сайт не открывается после перезагрузки сервера | `systemctl is-enabled docker caddy` должны быть `enabled`; контейнер поднимается сам (`restart: unless-stopped`). |
| После обновления пропали ваши изменения, данные вернулись к демо | Выросла `SEED_VERSION`: база пересоздана. Вернуть данные: `./deploy/rollback.sh`, затем `./deploy/restore.sh backups/ФАЙЛ-before-update.db.gz`. |
| На странице входа нет демо-аккаунтов, а база пустая; в логе `[seed] Боевой режим: демо-данные не создаются` | В `.env` нет `ALLOW_DEMO_SEED=true`. Добавьте строку и выполните `docker compose up -d --force-recreate`. Если база уже заполнена, аккаунты и так на месте, дело в `DEMO_MODE`. |
| Страницы открываются, но часть оформления или скриптов не работает; в консоли браузера ошибки `Content Security Policy` | Политика безопасности блокирует ресурс. Временно поставьте `CSP_REPORT_ONLY=true` в `.env` и `docker compose up -d --force-recreate`; пришлите текст ошибки из консоли. |
| 429 «Слишком много попыток входа» | Лимит хранится в памяти процесса. Подождите 10 минут или `docker compose restart app`. |
