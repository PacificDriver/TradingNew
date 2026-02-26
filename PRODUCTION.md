# Боевой режим: пополнение и вывод (HighHelp)

Платформа переведена в боевой режим. Пополнение и вывод средств работают через **HighHelp** (P2P, рубли).

Документация HighHelp: **[https://docs.highhelp.io](https://docs.highhelp.io/ru/ru/HEAD/index.html)** (ранее awesomedoc.highhelp.io).

---

## Переменные окружения бэкенда (.env)

Скопируйте `backend/.env.example` в `backend/.env` и задайте значения.

### Обязательные для платежей (HighHelp)

| Переменная | Описание | Пример |
|------------|----------|--------|
| **`HIGHHELP_PROJECT_ID`** | UUID проекта (кассы) из личного кабинета HighHelp | `57aff4db-b45d-42bf-bc5f-b7a499a01782` |
| **`HIGHHELP_PRIVATE_KEY_PEM`** | Приватный ключ RSA в формате PEM (получить в ЛК HighHelp) | `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"` |
| **`BACKEND_PUBLIC_URL`** | Публичный URL бэкенда (для колбеков HighHelp и редиректа после оплаты) | `https://api.yourdomain.com` или `https://xxxx.ngrok-free.app` |

Без этих переменных эндпоинты `POST /payments/deposit` и `POST /payments/withdraw` возвращают **503** («Платежи временно недоступны»), в интерфейсе отображается «Платежи не настроены».

### Опциональные

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| **`HIGHHELP_API_BASE`** | Базовый URL API HighHelp | `https://api.hh-processing.com` |
| **`FRONTEND_ORIGIN`** | CORS и редирект после оплаты. По умолчанию: `http://localhost:3000`, `http://localhost:3001`, `https://aurabotrade.com`. В проде можно задать только прод: `https://aurabotrade.com` (тогда редирект после оплаты пойдёт на него) | — |
| **`JWT_SECRET`** | Секрет для JWT (в проде задать свой) | — |
| **`DATABASE_URL`** | Подключение к PostgreSQL | см. `.env.example` |

---

## Как это работает

1. **Пополнение (payin)**  
   Пользователь на странице «Пополнение» вводит сумму → бэкенд создаёт заявку в HighHelp и возвращает `formUrl` → пользователь переходит по ссылке, оплачивает (P2P, карта) → HighHelp шлёт колбек на `POST /payments/webhook` → бэкенд начисляет сумму на баланс пользователя.

2. **Вывод (payout)**  
   Пользователь вводит сумму и реквизиты карты → бэкенд списывает сумму с баланса и создаёт заявку в HighHelp → после обработки средства приходят на указанную карту. При ошибке/отказе HighHelp баланс возвращается (обработка в webhook).

3. **Webhook**  
   HighHelp вызывает `BACKEND_PUBLIC_URL/payments/webhook`. Убедитесь, что этот URL доступен извне (не localhost). Обработка идемпотентна по ключу `project_id:payment_id:status:sub_status`.

---

## Проверка колбеков (как включить в проде)

Чтобы колбек не принимался без проверки подписи (защита от поддельных запросов):

1. **project_id**  
   В теле колбека HighHelp всегда передаёт `project_id`. В коде он сверяется с `HIGHHELP_PROJECT_ID` из `.env`. Если не совпадает — ответ 401, баланс не меняется.

2. **RSA-подпись (рекомендуется)**  
   В ЛК HighHelp: **API** → **Настройки Callback** → блок **Public Key** → скачать файл.  
   В `backend/.env` задайте:
   ```env
   HIGHHELP_CALLBACK_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----
   MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
   -----END PUBLIC KEY-----"
   ```
   (можно в одну строку с `\n`). Колбеки HighHelp подписываются так же, как исходящие запросы (normalize(body) + timestamp → SHA256 → подпись). Проверяются заголовки `x-access-signature` и `x-access-timestamp`. Если задан этот ключ, без валидной подписи колбек не обрабатывается (401).

3. **Альтернатива — секрет**  
   Если в ЛК HighHelp выдают секрет для колбеков, задайте `HIGHHELP_WEBHOOK_SECRET`. Тогда проверяется заголовок `X-Webhook-Secret` (равен секрету) или `X-HighHelp-Signature` = HMAC-SHA256(raw body, секрет) в hex.

Подробнее: [docs.highhelp.io — примеры JS, раздел «Обработка колбэков»](https://docs.highhelp.io/sdk/js_example/).

---

## Чек-лист перед запуском в проде

Краткий список — полный **анализ безопасности и чек-лист для production** см. в **[SECURITY_ANALYSIS.md](SECURITY_ANALYSIS.md)**.

- [ ] В `backend/.env` заданы `HIGHHELP_PROJECT_ID`, `HIGHHELP_PRIVATE_KEY_PEM`, `BACKEND_PUBLIC_URL`.
- [ ] `BACKEND_PUBLIC_URL` указывает на реальный **HTTPS**-адрес бэкенда (колбеки должны доходить).
- [ ] В настройках проекта в ЛК HighHelp указан URL колбека (или используется стандартный путь `/payments/webhook`).
- [ ] Для проверки колбеков задан `HIGHHELP_CALLBACK_PUBLIC_KEY_PEM` (публичный ключ из ЛК → API → Настройки Callback) или `HIGHHELP_WEBHOOK_SECRET`.
- [ ] Задан надёжный `JWT_SECRET` (не дефолтный).
- [ ] На фронте при сборке заданы `NEXT_PUBLIC_API_BASE_URL` и `NEXT_PUBLIC_WS_URL` на ваш бэкенд (если не через один домен). В проде — только HTTPS/WSS.

После этого пополнение и вывод в интерфейсе работают в боевом режиме через HighHelp.

---

## Коды ошибок API (только для админа)

Пользователь видит только общие сообщения («Сервер недоступен», «Временная ошибка сервера»). В консоли браузера (F12) и в объекте ошибки доступен код для диагностики:

| Код  | Значение для админа |
|------|----------------------|
| **E001** | Бэкенд недоступен (сетевой сбой, бэкенд не запущен). |
| **E002** | Ответ пришёл не от API (HTML или «Cannot GET/POST») — проверьте `NEXT_PUBLIC_API_BASE_URL` во фронте и что бэкенд слушает на нужном порту (по умолчанию 4000). |
| **E003** | Ошибка сервера 5xx. |

Фронт по умолчанию проксирует `/api-proxy` на `http://localhost:4000`. Для туннеля задайте в `frontend/.env.local`: `NEXT_PUBLIC_API_BASE_URL=https://ваш-туннель.ngrok-free.app`.
