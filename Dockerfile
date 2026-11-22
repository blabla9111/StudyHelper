# StudyHelper: образ для боевого сервера (Node 22, один процесс, SQLite).
#
# Сборка:  docker compose build
#
# Если Docker Hub с вашего сервера недоступен, подставьте зеркало базового образа:
#   NODE_IMAGE=<адрес-зеркала>/node:22-bookworm-slim  (в файле .env)
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- 1. Зависимости ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# .npmrc (ignore-scripts=true) нужен: better-sqlite3 приходит с готовыми бинарниками
# для linux x64/arm64 (glibc), компилятор в образе не требуется.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ---------- 2. Сборка Next.js ----------
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# ---------- 3. Рабочий образ ----------
# npm start запускает tsx (seed) и next start, поэтому остаются все зависимости, а также scripts/ и src/.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    TZ=Europe/Moscow \
    DATABASE_PATH=/data/studyhelper.db
WORKDIR /app

# Папка для базы лежит вне образа (в томе) и принадлежит не-root пользователю node
RUN mkdir -p /data && chown node:node /data

# assets/ (шрифты и запасная справка) приезжает вместе с проектом
COPY --from=build --chown=node:node /app ./

USER node
VOLUME ["/data"]
EXPOSE 3000

# Внутри контейнера слушаем все адреса; наружу порт открывает только docker-compose.yml (127.0.0.1)
CMD ["npm", "start", "--", "-H", "0.0.0.0"]
