# Реферальная программа на отдельном домене

Реферальная программа может работать как на основном сайте (`/referral`), так и на **отдельном домене** (например `https://blabla.su` при основном сайте `example.com`).

## Готовый отдельный проект: `referral-site/`

В папке `TradingNew/referral-site/` находится **отдельный Next.js-проект** реферальной программы. Его можно развернуть на любом домене (blabla.su, partners.example.com и т.д.).

```bash
cd TradingNew/referral-site
cp .env.example .env
# Отредактируйте .env: NEXT_PUBLIC_REFERRAL_API_URL, NEXT_PUBLIC_MAIN_SITE_URL
npm install
npm run build
npm start
```

## Архитектура

- **Основной сайт**: `example.com` — торговля, профиль, админка
- **Реферальная программа**: `blabla.su` — отдельный домен, обращается к API основного сайта
- **API**: общий бэкенд основного сайта (`api.example.com` или `example.com/api`)

## Аутентификация при отдельном домене

На отдельном домене **cookies не работают** (cross-origin). Используется **Bearer token** в `localStorage`:

1. Логин/регистрация возвращают `{ token, partner }`
2. Токен сохраняется в `localStorage` (ключ `referral_partner_token`)
3. Все запросы отправляют заголовок `Authorization: Bearer <token>`
4. Бэкенд принимает Bearer token (уже реализовано)

## Настройка

### 1. Бэкенд (основной сайт example.com)

Добавьте в `.env`:

```env
# Домен реферальной программы — для CORS (blabla.su)
REFERRAL_FRONTEND_ORIGIN=https://blabla.su
```

Бэкенд добавит этот origin в разрешённые CORS.

### 2. Реферальная программа (отдельный домен blabla.su)

В `referral-site/.env` или при сборке:

```env
# URL API основного сайта (обязательно)
NEXT_PUBLIC_REFERRAL_API_URL=https://api.example.com

# URL основного сайта для ссылок «Пополнение / Вывод»
NEXT_PUBLIC_MAIN_SITE_URL=https://example.com
```

### 3. Реферальные ссылки

В бэкенде уже используется `MAIN_SITE_URL` для формирования ссылок вида `{MAIN_SITE}/register?ref=CODE`. Убедитесь, что он указывает на основной сайт:

```env
MAIN_SITE_URL=https://main-site.com
```

## Деплой реферальной программы

### Вариант A: Готовый проект `referral-site/` (рекомендуется)

```bash
cd TradingNew/referral-site
npm install
# Создайте .env с NEXT_PUBLIC_REFERRAL_API_URL и NEXT_PUBLIC_MAIN_SITE_URL
npm run build
npm start
# Или деплой на Vercel/Netlify: укажите переменные окружения в настройках
```

### Вариант B: Встроенная рефералка на основном сайте

Если реферальная программа на `partners.example.com` и основной сайт на `example.com` — это **один и тот же** Next.js-проект (frontend), то `NEXT_PUBLIC_REFERRAL_API_URL` не нужен: используется `/api-proxy` и cookies.

## Проверка

1. Откройте реферальную программу на отдельном домене
2. Зарегистрируйтесь или войдите
3. Убедитесь, что данные загружаются (статистика, рефералы и т.д.)
4. В DevTools → Application → Local Storage должен быть ключ `referral_partner_token`

## Безопасность

- Токен хранится в `localStorage` — уязвим к XSS. Используйте CSP и санитизацию ввода
- Срок жизни токена: 7 дней (настраивается в бэкенде)
- При выходе токен удаляется из `localStorage`
