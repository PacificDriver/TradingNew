# Скрипт автодеплоя

`deploy.sh` — интерактивный деплой с выбором домена.

## Запуск на сервере (Linux)

```bash
# Из корня проекта
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## Что делает скрипт

1. **Выбор домена**
   - **Ввести вручную** — вводите домен (например `yourdomain.com`), при необходимости указываете, что API на поддомене `api.yourdomain.com`.
   - **Выбрать из списка** — если есть файл `scripts/domains.txt`, можно выбрать домен из списка.
   - **Не менять .env** — использовать уже настроенный `.env` и только собрать/запустить контейнеры.

2. **Обновление .env**
   - В корне проекта записываются `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL` и при отсутствии — `JWT_SECRET` (генерируется).

3. **Backend .env**
   - Если `backend/.env` нет, копируется из `backend/.env.example` (нужно потом задать `ADMIN_EMAIL` и `ADMIN_PASSWORD`).

4. **Сборка и запуск**
   - `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`

5. **Админ**
   - По желанию запускается `npx ts-node scripts/create-admin.ts` (пароль из `backend/.env`).

## Список доменов

Чтобы выбирать домен из списка:

```bash
cp scripts/domains.txt.example scripts/domains.txt
# Отредактируйте domains.txt — по одному домену на строку
```

В меню деплоя появится пункт «Выбрать из списка сохранённых».
