#!/usr/bin/env bash
# Автодеплой с выбором домена. Запуск из корня проекта: ./scripts/deploy.sh

set -e
cd "$(dirname "$0")/.."
SCRIPT_DIR="$(pwd)"
DOMAINS_FILE="$SCRIPT_DIR/scripts/domains.txt"

echo "=== Деплой приложения ==="
echo ""

# Проверка Docker и Docker Compose (плагин v2 или standalone docker-compose)
if ! command -v docker &>/dev/null; then
  echo "Ошибка: Docker не найден. Установите Docker и Docker Compose."
  exit 1
fi
if docker compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null && docker-compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Ошибка: Docker Compose не найден. Установите плагин (docker compose) или standalone (docker-compose)."
  exit 1
fi

# Вывод меню в stderr, чтобы в choice_result попадали только URL или метка
menu_echo() { echo "$@" >&2; }

# Выбор способа задания домена (в stdout только результат: 2 строки URL или "USE_EXISTING")
choose_domain() {
  local api_url ws_url
  menu_echo "Как задать домен?"
  menu_echo "  1) Ввести домен вручную"
  if [[ -f "$DOMAINS_FILE" ]]; then
    menu_echo "  2) Выбрать из списка сохранённых (scripts/domains.txt)"
  fi
  menu_echo "  3) Не менять .env, только собрать и запустить"
  menu_echo ""
  read -rp "Ваш выбор (1/2/3): " choice

  case "$choice" in
    1)
      read -rp "Основной домен (например yourdomain.com): " domain
      domain=$(echo "$domain" | sed 's|^https\?://||;s|^www\.||;s|/.*||')
      [[ -z "$domain" ]] && { menu_echo "Домен не задан."; exit 1; }
      read -rp "API на поддомене api.$domain? (y/n, по умолчанию y): " use_api_sub
      use_api_sub=${use_api_sub:-y}
      if [[ "$use_api_sub" =~ ^[yYдД] ]]; then
        api_url="https://api.$domain"
        ws_url="wss://api.$domain"
      else
        api_url="https://$domain"
        ws_url="wss://$domain"
      fi
      echo "$api_url"
      echo "$ws_url"
      return
      ;;
    2)
      if [[ ! -f "$DOMAINS_FILE" ]]; then
        menu_echo "Файл scripts/domains.txt не найден."
        exit 1
      fi
      mapfile -t domains < <(grep -v '^#' "$DOMAINS_FILE" | grep -v '^[[:space:]]*$' || true)
      if [[ ${#domains[@]} -eq 0 ]]; then
        menu_echo "В domains.txt нет доменов."
        exit 1
      fi
      menu_echo "Доступные домены:"
      for i in "${!domains[@]}"; do
        menu_echo "  $((i+1))) ${domains[$i]}"
      done
      read -rp "Номер (1-${#domains[@]}): " num
      if [[ ! "$num" =~ ^[0-9]+$ ]] || (( num < 1 || num > ${#domains[@]} )); then
        menu_echo "Неверный выбор."
        exit 1
      fi
      domain="${domains[$((num-1))]}"
      domain=$(echo "$domain" | sed 's|^https\?://||;s|^www\.||;s|/.*||')
      read -rp "API на поддомене api.$domain? (y/n, по умолчанию y): " use_api_sub
      use_api_sub=${use_api_sub:-y}
      if [[ "$use_api_sub" =~ ^[yYдД] ]]; then
        api_url="https://api.$domain"
        ws_url="wss://api.$domain"
      else
        api_url="https://$domain"
        ws_url="wss://$domain"
      fi
      echo "$api_url"
      echo "$ws_url"
      return
      ;;
    3)
      if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
        menu_echo "Файл .env не найден. Создайте его или выберите 1 или 2."
        exit 1
      fi
      echo "USE_EXISTING"
      return
      ;;
    *)
      menu_echo "Неверный выбор."
      exit 1
      ;;
  esac
}

# Обновление .env в корне
update_env() {
  local api_url="$1"
  local ws_url="$2"
  local jwt_secret

  if [[ -n "$api_url" && -n "$ws_url" ]]; then
    if [[ -f "$SCRIPT_DIR/.env" ]]; then
      # Удаляем старые NEXT_PUBLIC_ и обновляем JWT_SECRET при отсутствии
      grep -v '^NEXT_PUBLIC_' "$SCRIPT_DIR/.env" > "$SCRIPT_DIR/.env.tmp" || true
      mv "$SCRIPT_DIR/.env.tmp" "$SCRIPT_DIR/.env"
    else
      touch "$SCRIPT_DIR/.env"
    fi
    echo "NEXT_PUBLIC_API_BASE_URL=$api_url" >> "$SCRIPT_DIR/.env"
    echo "NEXT_PUBLIC_WS_URL=$ws_url" >> "$SCRIPT_DIR/.env"
    if ! grep -q '^JWT_SECRET=' "$SCRIPT_DIR/.env" 2>/dev/null; then
      jwt_secret=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
      echo "JWT_SECRET=$jwt_secret" >> "$SCRIPT_DIR/.env"
      echo "Добавлен сгенерированный JWT_SECRET в .env"
    fi
    echo "В .env записаны: API=$api_url, WS=$ws_url"
  fi
}

# Основной поток
choice_result=$(choose_domain) || exit $?
if [[ "$choice_result" == "USE_EXISTING" ]]; then
  echo "Используется существующий .env"
else
  api_url=$(echo "$choice_result" | head -1)
  ws_url=$(echo "$choice_result" | tail -1)
  update_env "$api_url" "$ws_url"
fi

# backend/.env — должен существовать (для env_file)
if [[ ! -f "$SCRIPT_DIR/backend/.env" ]]; then
  if [[ -f "$SCRIPT_DIR/backend/.env.example" ]]; then
    cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
    echo "Создан backend/.env из .env.example. Отредактируйте ADMIN_EMAIL и ADMIN_PASSWORD."
  else
    echo "Создайте backend/.env (см. backend/.env.example)."
    exit 1
  fi
fi

echo ""
echo "Сборка и запуск контейнеров..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env up -d --build

echo ""
echo "Ожидание запуска backend (миграции выполняются при старте)..."
sleep 15

echo ""
read -rp "Создать учётную запись администратора? (y/n, по умолчанию y): " create_admin
create_admin=${create_admin:-y}
if [[ "$create_admin" =~ ^[yYдД] ]]; then
  $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml exec backend npx ts-node scripts/create-admin.ts || true
fi

echo ""
echo "=== Деплой завершён ==="
echo "Frontend:  http://localhost:3000 (или ваш домен через Nginx)"
echo "Backend:   http://localhost:4000"
echo "Проверка:  $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps"
echo "Логи:      $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs -f"
