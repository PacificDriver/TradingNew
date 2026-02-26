# Полное руководство по деплою и настройке

Исчерпывающая инструкция по развёртыванию платформы бинарных опционов на production-сервере.

---

## Содержание

1. [Требования к серверу](#1-требования-к-серверу)
2. [Установка Docker](#2-установка-docker)
3. [Структура проекта и окружение](#3-структура-проекта-и-окружение)
4. [Переменные окружения](#4-переменные-окружения)
5. [Подготовка файлов конфигурации](#5-подготовка-файлов-конфигурации)
6. [Запуск деплоя](#6-запуск-деплоя)
7. [Nginx и SSL](#7-nginx-и-ssl)
8. [Реферальная программа (отдельный домен)](#8-реферальная-программа-отдельный-домен)
9. [Обновление приложения](#9-обновление-приложения)
10. [Резервное копирование](#10-резервное-копирование)
11. [Безопасность и чеклист](#11-безопасность-и-чеклист)
12. [Устранение неполадок](#12-устранение-неполадок)

---

## 1. Требования к серверу

| Параметр | Минимум (тест) | Рекомендуется (продакшен) |
|----------|----------------|---------------------------|
| ОС | Ubuntu 22.04 LTS или аналог | Ubuntu 22.04 LTS |
| RAM | 1 GB | 2 GB+ |
| CPU | 1 vCPU | 2 vCPU |
| Диск | 10 GB SSD | 20+ GB SSD |
| Сеть | Публичный IP | Домен + SSL |

**Дополнительно:**
- Домен (опционально, но желательно для HTTPS)
- Порты 80 и 443 открыты для входящих соединений

---

## 2. Установка Docker

### Ubuntu / Debian

```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod 644 /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

**Важно:** выйдите из сессии и войдите снова, либо выполните `newgrp docker`.

### Проверка

```bash
docker --version
docker compose version
```

---

## 3. Структура проекта и окружение

### Клонирование

```bash
git clone https://github.com/YOUR_USER/Trading.git
cd Trading/TradingNew
```

Либо загрузите архив проекта по SCP/SFTP в каталог на сервере.

### Структура

```
TradingNew/
├── backend/           # Node.js API + WebSocket
├── frontend/           # Next.js приложение
├── referral-site/      # Реферальная программа (отдельный домен)
├── docker-compose.yml # Локальная разработка
├── docker-compose.yml # Production
├── docker-compose.dev.yml
├── .env                # В корне — для compose (создать)
├── backend/.env        # В backend — для приложения (создать)
└── scripts/
    ├── deploy.sh           # Интерактивный деплой
    ├── domains.txt.example # Шаблон списка доменов
    └── domains.txt         # Список доменов (опционально, создать из .example)
```

---

## 4. Переменные окружения

### 4.1 Корень проекта (`.env`)

Используется при `docker compose -f docker-compose.prod.yml --env-file .env`.

```env
# Обязательно
JWT_SECRET=сгенерируйте_через_openssl_rand_base64_32
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com

# Генерация JWT_SECRET:
# openssl rand -base64 32
```

**Важно:** `NEXT_PUBLIC_*` встраиваются в frontend при сборке. API-запросы идут через Next.js (`/api-proxy` → backend). WebSocket подключается напрямую к `NEXT_PUBLIC_WS_URL`. Если всё на одном домене, WebSocket должен проксироваться в Nginx (см. раздел 7).

### 4.2 Backend (`backend/.env`)

```env
# === БД (в Docker оставьте как есть) ===
DATABASE_URL=postgresql://mvp_user:mvp_password@postgres:5432/mvp_trading?schema=public

# === Безопасность (обязательно в проде) ===
JWT_SECRET=ваш_длинный_секрет_от_openssl_rand_base64_32
PORT=4000

# === CORS ===
# Origins с которых разрешены запросы. Добавьте домен фронта.
FRONTEND_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# Реферальная программа на отдельном домене — для CORS
# REFERRAL_FRONTEND_ORIGIN=https://partners.yourdomain.com

# === Админ (скрипт create-admin) ===
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=надёжный_пароль_не_менее_12_символов

# === HighHelp (пополнение и вывод) — обязательны для боевого режима ===
# Документация: https://docs.highhelp.io
# HIGHHELP_PROJECT_ID=57aff4db-b45d-42bf-bc5f-b7a499a01782
# HIGHHELP_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----"
# Публичный URL бэкенда (для колбеков и редиректа после оплаты)
# BACKEND_PUBLIC_URL=https://api.yourdomain.com

# === Telegram: уведомления о балансе и алерты ===
# TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
# TELEGRAM_CHAT_ID=-1001234567890
```

### 4.3 Сводка переменных

| Переменная | Где | Обязательно | Описание |
|------------|-----|-------------|----------|
| `JWT_SECRET` | Корень + backend | Да | Секрет для JWT (32+ символов) |
| `NEXT_PUBLIC_API_BASE_URL` | Корень | Да | URL API для frontend (build-time) |
| `NEXT_PUBLIC_WS_URL` | Корень | Да | URL WebSocket (build-time) |
| `ADMIN_EMAIL` | backend | Да | Email для входа в админку |
| `ADMIN_PASSWORD` | backend | Да | Пароль админа (не менее 12 символов) |
| `FRONTEND_ORIGIN` | backend | Да | Домен фронта для CORS |
| `REFERRAL_FRONTEND_ORIGIN` | backend | Если рефералка | Домен реферальной программы |
| `BACKEND_PUBLIC_URL` | backend | Для платежей | Публичный URL бэкенда |
| `HIGHHELP_*` | backend | Для платежей | Настройки HighHelp |

---

## 5. Подготовка файлов конфигурации

### 5.1 Создание `.env` в корне

```bash
cd /path/to/TradingNew
cp .env.example .env
nano .env
```

Заполните `JWT_SECRET`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`.

### 5.2 Создание `backend/.env`

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

**Обязательно задайте:**
- `ADMIN_EMAIL` — ваш email для админки
- `ADMIN_PASSWORD` — надёжный пароль (минимум 12 символов)
- `FRONTEND_ORIGIN` — URL вашего фронта (например `https://yourdomain.com`)

### 5.3 Проверка `docker-compose.prod.yml`

Файл уже должен быть в проекте. Он содержит:
- PostgreSQL с healthcheck
- Backend с миграциями при старте
- Frontend с build-аргументами

---

## 6. Запуск деплоя

### Вариант A: Интерактивный скрипт (рекомендуется)

```bash
cd /path/to/TradingNew
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Скрипт:
1. Предложит выбрать домен (вручную, из списка или использовать существующий `.env`)
2. Обновит `.env` в корне
3. Создаст `backend/.env` из примера при отсутствии
4. Соберёт и запустит контейнеры
5. Предложит создать учётную запись администратора

### Вариант B: Ручной запуск

```bash
cd /path/to/TradingNew

# Сборка и запуск
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Ожидание запуска (миграции выполняются при старте backend)
sleep 15

# Создание админа
docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/create-admin.ts
```

### Проверка

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

- Frontend: http://localhost:3000 (или ваш домен через Nginx)
- Backend API: http://localhost:4000
- Health: `curl http://localhost:4000/health` → `{"ok":true}`

---

## 7. Nginx и SSL

### 7.1 Установка Nginx и Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 7.2 Получение SSL-сертификата

```bash
# Один домен
sudo certbot --nginx -d yourdomain.com

# Фронт и API на поддоменах
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

### 7.3 Конфигурация Nginx

#### Вариант 1: Фронт и API на одном домене

Фронт: `https://yourdomain.com`  
API: через Next.js `/api-proxy` → backend  
WebSocket: `wss://yourdomain.com/ws` → backend

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

    # WebSocket — до location /, иначе перехватит frontend
    location /ws {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Frontend (Next.js) — API идёт через /api-proxy внутри Next.js
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
}
```

В `.env` в корне:
```env
NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com
NEXT_PUBLIC_WS_URL=wss://yourdomain.com/ws
```

**Примечание:** API-запросы идут через Next.js (`/api-proxy` → backend). WebSocket подключается к `/ws`, Nginx проксирует на backend.

#### Вариант 2: API на поддомене

Фронт: `https://yourdomain.com`  
API: `https://api.yourdomain.com`

**Сайт фронта** (`/etc/nginx/sites-available/trading-front`):

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

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
}
```

**Сайт API** (`/etc/nginx/sites-available/trading-api`):

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

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

В `.env` в корне:
```env
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

### 7.4 Активация и перезагрузка

```bash
sudo ln -sf /etc/nginx/sites-available/trading /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7.5 Автообновление SSL

```bash
sudo certbot renew --dry-run
```

Certbot добавляет cron/timer для автоматического обновления.

---

## 8. Реферальная программа (отдельный домен)

Если реферальная программа на отдельном домене (например `https://partners.yourdomain.com`):

### 8.1 Backend

В `backend/.env`:
```env
REFERRAL_FRONTEND_ORIGIN=https://partners.yourdomain.com
```

### 8.2 Реферальный сайт

```bash
cd TradingNew/referral-site
cp .env.example .env
nano .env
```

```env
NEXT_PUBLIC_REFERRAL_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_MAIN_SITE_URL=https://yourdomain.com
```

```bash
npm install
npm run build
npm start
```

Или деплой на Vercel/Netlify с указанием этих переменных.

### 8.3 Nginx для рефералки

```nginx
server {
    listen 443 ssl http2;
    server_name partners.yourdomain.com;
    ssl_certificate     ...;
    ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:3002;
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

---

## 9. Обновление приложения

```bash
cd /path/to/TradingNew
git pull

# Пересборка и перезапуск
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Миграции (выполняются при старте backend, но при сбое — вручную)
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

**Важно:** При изменении `NEXT_PUBLIC_*` обязательно пересоберите frontend (`--build`).

---

## 10. Резервное копирование

### Создание дампа БД

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U mvp_user mvp_trading > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановление

```bash
# Осторожно: перезаписывает БД
cat backup_YYYYMMDD_HHMMSS.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U mvp_user mvp_trading
```

### Cron для ежедневных дампов

```bash
crontab -e
```

Добавьте:
```
0 3 * * * cd /path/to/TradingNew && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U mvp_user mvp_trading > /backups/trading_$(date +\%Y\%m\%d).sql
```

Храните копии вне сервера (S3, другой хост).

---

## 11. Безопасность и чеклист

### Обязательно

- [ ] `JWT_SECRET` — уникальный, 32+ символов (`openssl rand -base64 32`)
- [ ] `ADMIN_PASSWORD` — не менее 12 символов, не из словаря
- [ ] `FRONTEND_ORIGIN` — только ваши домены, без лишних
- [ ] SSL (HTTPS) включён
- [ ] Порты 3000 и 4000 не открыты наружу (только через Nginx)
- [ ] Firewall: разрешены только 80, 443, 22

### Рекомендуется

- [ ] Регулярные обновления ОС и пакетов
- [ ] Резервное копирование БД (cron)
- [ ] Мониторинг логов (`docker compose logs -f`)
- [ ] Fail2ban для SSH

### Платежи (HighHelp)

- [ ] `BACKEND_PUBLIC_URL` — публичный URL бэкенда
- [ ] `HIGHHELP_PROJECT_ID` и `HIGHHELP_PRIVATE_KEY_PEM` заданы
- [ ] Webhook HighHelp доступен по HTTPS
- [ ] Проверка подписи колбеков (опционально: `HIGHHELP_CALLBACK_PUBLIC_KEY_PEM`)

---

## 12. Устранение неполадок

### Контейнеры не стартуют

```bash
docker compose -f docker-compose.prod.yml logs
```

Проверьте:
- Доступность PostgreSQL (healthcheck)
- Наличие `backend/.env` и `.env` в корне
- Синтаксис YAML

### Frontend не подключается к API

- Убедитесь, что `NEXT_PUBLIC_API_BASE_URL` и `NEXT_PUBLIC_WS_URL` соответствуют реальным URL
- При изменении переменных — пересоберите: `docker compose -f docker-compose.prod.yml up -d --build frontend`
- Проверьте CORS: в `backend/.env` должен быть `FRONTEND_ORIGIN` с вашим доменом

### WebSocket не подключается

- Nginx должен проксировать Upgrade/Connection
- `NEXT_PUBLIC_WS_URL` — `wss://` (не `ws://`) для HTTPS
- Проверьте, что бэкенд слушает на 4000

### Ошибка E002 (response not from API)

- Неверный `NEXT_PUBLIC_API_BASE_URL` или backend недоступен
- Next.js rewrites `/api-proxy` на `BACKEND_URL` — в Docker это `http://backend:4000`

### Миграции не применяются

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

### Админ не может войти

```bash
docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/create-admin.ts
```

Проверьте `ADMIN_EMAIL` и `ADMIN_PASSWORD` в `backend/.env`.

---

## Краткий чеклист деплоя

1. Установить Docker и Docker Compose
2. Клонировать/загрузить проект
3. Создать `.env` в корне (JWT_SECRET, NEXT_PUBLIC_*)
4. Создать `backend/.env` (ADMIN_*, FRONTEND_ORIGIN)
5. Запустить: `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`
6. Создать админа: `docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/create-admin.ts`
7. Настроить Nginx и SSL
8. Проверить доступ к сайту и API
