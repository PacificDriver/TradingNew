# Инструкция по деплою на сервер

Полное руководство по развёртыванию приложения (PostgreSQL + Backend + Frontend) на VPS/сервере.

---

## 1. Требования к серверу

- **ОС:** Linux (Ubuntu 22.04 LTS или аналог)
- **Docker** и **Docker Compose** v2+
- **Минимум:** 1 GB RAM, 1 vCPU, 10 GB диск (для теста достаточно)
- **Рекомендуется для продакшена:** 2 GB RAM, 2 vCPU, 20+ GB SSD
- Домен (опционально, но желательно для HTTPS)

Установка Docker на Ubuntu:
```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a644 /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
# выйти и зайти снова в сессию или выполнить: newgrp docker
```

---

## 2. Подготовка репозитория на сервере

```bash
# Клонирование (подставьте свой репозиторий)
git clone https://github.com/YOUR_USER/Trading.git
cd Trading
```

Либо загрузите архив проекта по SCP/SFTP в каталог на сервере.

---

## 3. Переменные окружения для продакшена

### 3.1 Backend

Создайте файл `backend/.env` (скопируйте из примера и отредактируйте):

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

**Обязательно измените в продакшене:**

| Переменная | Описание | Пример для продакшена |
|------------|----------|------------------------|
| `DATABASE_URL` | Строка подключения к PostgreSQL | В Docker оставьте `postgresql://mvp_user:mvp_password@postgres:5432/mvp_trading?schema=public` |
| `JWT_SECRET` | Секрет для JWT (придумайте длинную случайную строку) | Используйте генератор: `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Email админа | `admin@yourdomain.com` |
| `ADMIN_PASSWORD` | Пароль админа (не менее 12 символов) | Надёжный пароль |

**Опционально (платежи HighHelp):**

- `HIGHHELP_PROJECT_ID`, `HIGHHELP_PRIVATE_KEY_PEM`
- `BACKEND_PUBLIC_URL` — публичный URL бэкенда (например `https://api.yourdomain.com`)
- `HIGHHELP_API_BASE` — по умолчанию `https://api.hh-processing.com`

### 3.2 Frontend (URL API и WebSocket)

Фронтенд при **сборке** подставляет в код переменные `NEXT_PUBLIC_*`. Их нужно задать до `docker compose build`.

Создайте файл `frontend/.env.production` (или задайте переменные в `docker-compose.prod.yml`, см. ниже):

```env
# Подставьте ваш реальный домен или IP
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

Если бэкенд и фронт на одном домене через Nginx (например `https://yourdomain.com` и `https://yourdomain.com/api`):

```env
NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com
NEXT_PUBLIC_WS_URL=wss://yourdomain.com
```

---

## 4. Production Docker Compose

В корне проекта создайте `docker-compose.prod.yml` (или используйте приведённый ниже конфиг).

**Важно:** в продакшене у бэкенда нужно выполнить миграции БД при старте. Ниже — вариант с `docker-compose.prod.yml` и скриптом входа для бэкенда.

### Файл `docker-compose.prod.yml`

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: mvp_user
      POSTGRES_PASSWORD: mvp_password
      POSTGRES_DB: mvp_trading
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # Порт наружу не открываем — доступ только из backend
    # ports: ["55432:5432"]  # раскомментируйте, если нужен доступ с хоста

  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://mvp_user:mvp_password@postgres:5432/mvp_trading?schema=public
      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
      PORT: 4000
    env_file: ./backend/.env
    ports:
      - "4000:4000"
    command: ["sh", "-c", "npx prisma migrate deploy && npm run start"]

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4000}
        NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL:-ws://localhost:4000}
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4000}
      NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL:-ws://localhost:4000}
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

Для передачи build-аргументов во frontend при сборке Next.js нужна доработка Dockerfile (см. раздел 5).

### Healthcheck для Postgres (опционально)

В `docker-compose.prod.yml` в сервис `postgres` можно добавить:

```yaml
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: mvp_user
      POSTGRES_PASSWORD: mvp_password
      POSTGRES_DB: mvp_trading
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mvp_user -d mvp_trading"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Тогда `depends_on: postgres: condition: service_healthy` будет ждать готовности БД.

---

## 5. Сборка Frontend с переменными (NEXT_PUBLIC_*)

В Next.js переменные `NEXT_PUBLIC_*` встраиваются в бандл на этапе **build**. Нужно передать их как build-args в Docker.

Измените `frontend/Dockerfile` так, чтобы принимать аргументы:

```dockerfile
FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY package.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs next-env.d.ts ./
COPY app ./app
COPY components ./components
COPY store ./store
COPY lib ./lib

RUN npm install
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
```

В `docker-compose.prod.yml` у сервиса `frontend` уже указаны `args` для этих переменных; при запуске передайте их из `.env` в корне (см. шаг 6).

---

## 6. Файл `.env` в корне проекта (для Compose)

В **корне** проекта (рядом с `docker-compose.prod.yml`) создайте `.env`:

```env
JWT_SECRET=ваш_длинный_случайный_секрет_от_openssl_rand_base64_32
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

Так Docker Compose подставит их в сервисы и в build frontend.

---

## 7. Запуск деплоя

```bash
cd /path/to/Trading

# Сборка и запуск (production)
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Проверка логов
docker compose -f docker-compose.prod.yml logs -f
```

После первого запуска выполните миграции (если не используете `command` с `prisma migrate deploy` в backend):

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

Создание учётной записи админа (пароль берётся из `backend/.env` или генерируется):

```bash
docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/create-admin.ts
```

Сохраните выведенный логин и пароль.

---

## 8. Nginx как reverse proxy (рекомендуется для продакшена)

Установка Nginx и получение SSL через Let's Encrypt (certbot):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

Пример конфига Nginx для одного домена (фронт + API на одном домене):

```nginx
# /etc/nginx/sites-available/trading
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API и WebSocket
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Если API на поддомене `api.yourdomain.com`:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    ssl_certificate ...;
    ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Включите сайт и перезапустите Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/trading /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

В этом случае в `.env` в корне и в `frontend/.env.production` укажите:
- `NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com` (или `https://yourdomain.com` и префикс `/api` при необходимости)
- `NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com` (или ваш URL WebSocket).

---

## 9. Обновление приложения

```bash
cd /path/to/Trading
git pull

# Пересборка и перезапуск
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Миграции (если добавлялись новые)
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

---

## 10. Резервное копирование БД

```bash
# Создание дампа
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U mvp_user mvp_trading > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановление (осторожно, перезаписывает БД)
cat backup_YYYYMMDD_HHMMSS.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U mvp_user mvp_trading
```

Рекомендуется настроить cron для ежедневных дампов и хранение копий вне сервера.

---

## 11. Краткий чеклист деплоя

1. Установить Docker и Docker Compose на сервер.
2. Клонировать/загрузить проект, перейти в каталог.
3. Создать `backend/.env` из `backend/.env.example`, задать `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. В корне создать `.env` с `JWT_SECRET`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL` (для сборки фронта и compose).
5. При необходимости обновить `frontend/Dockerfile` для `ARG`/`ENV` (см. раздел 5).
6. Создать `docker-compose.prod.yml` (см. раздел 4), при необходимости добавить healthcheck для postgres.
7. Запуск: `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`.
8. Миграции: `docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy`.
9. Создать админа: `docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/create-admin.ts`.
10. Настроить Nginx и SSL, проверить доступ к сайту и API.

После этого деплой считается завершённым; дальнейшие обновления — по разделу 9.
