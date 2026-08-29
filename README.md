# Cloud Auth Bridge

Chrome MV3 расширение, которое привязывает браузер к Telegram-боту (`super_personal_assistant_bot`) и по команде из бота захватывает auth-куки/токены нужных сервисов (Figma, Notion, GitHub, Linear, Tilda, Claude и др.) и передаёт их через token-relay сервер.

Версия: **1.2.0** (`manifest.json` / `package.json`).

## Установка (developer mode)

1. Скачай/склонируй репозиторий (или возьми ZIP из [Releases](../../releases) — собирается автоматически на тег `v*`).
2. Открой `chrome://extensions/`.
3. Включи **Режим разработчика** (переключатель в правом верхнем углу).
4. Нажми **Загрузить распакованное расширение** (Load unpacked) → выбери корневую папку репозитория `cloud-auth-bridge/` (там, где лежит `manifest.json`).
5. Иконка расширения появится на панели инструментов Chrome.

Обновление после `git pull`: на странице `chrome://extensions/` нажать ⟳ (Reload) на карточке расширения.

## Первый запуск (pairing)

1. В Telegram-боте отправь `/chromeext_connect` — бот пришлёт 6-значный код.
2. Кликни на иконку расширения → откроется попап.
3. Введи код (или перейди по deep-link из попапа, если Telegram установлен) → **Подключить**.
4. После успешного pairing расширение начинает опрашивать relay (adaptive polling: 3 мин в простое, 1 мин в активном режиме после получения команды).
5. Имя профиля определяется автоматически по Google-аккаунту Chrome (`chrome.identity`); можно переопределить в `⚙️ Настройки`. Токены сохраняются с префиксом `<профиль>.<сервис>` (например `vladimir.figma`).

## Использование

- **Автоматически**: бот присылает команду `open_url` / `fetch_token` → расширение само открывает вкладку, ждёт логина/загрузки нужного URL, вытаскивает куки через per-service экстрактор и отправляет на relay.
- **Вручную из попапа**:
  - На любом `https://` сайте — кнопка **Передать токен** отправляет куки текущей вкладки.
  - **Быстрый захват** — кнопки для GitHub, Figma, Notion, Linear, Tilda, Claude: открывают сайт, ждут логина и сами шлют токен.
- **Zero-touch Claude OAuth**: на странице `claude.ai/oauth/authorize` (и `claude.com/cai/oauth/authorize`) content-script `auto-authorize.js` сам кликает кнопку **Authorize**, если она появляется — весь OAuth-флоу проходит без участия пользователя.

## Настройки

Иконка расширения → `⚙️`:
- **Имя профиля** — префикс для токенов (auto-detect по Google-аккаунту, можно переопределить).
- **URL token-relay сервера** — по умолчанию продакшн (`https://136-65-7-197.sslip.io`), для локальной разработки — `http://localhost:8081`.
- **Сброс** — отключает pairing, требует заново ввести код.

## Архитектура

```
Telegram bot  ←→  token-relay (HTTPS, sslip.io + Let's Encrypt)  ←→  Chrome Extension (MV3)
                              ↑
                       GCP Secret Manager
```

- `background/service-worker.js` — состояние (`pairingToken`, `relayUrl`, `profileName`), adaptive polling через `chrome.alarms`, `waitForTabLoad` (SW не засыпает во время capture-флоу), выполнение команд от бота (`fetch_token`, `open_url`, `clear_badge`), debug-логирование на relay.
- `background/extractors.js` — per-service экстракторы куки: знают, какие именно cookies нужны для Figma/Notion/GitHub (verified), Linear/Tilda (полный dump, cookies не верифицированы), Slack (частично — реальный API-токен в JS-контексте, не в cookie). Неизвестные домены → generic fallback (полный dump всех куки).
- `popup/` — UI: ввод pairing-кода, статус подключения, карточка текущего сайта, кнопки быстрого захвата, отключение.
- `content/auto-authorize.js` — авто-клик кнопки Authorize на Claude OAuth странице.
- `content/interceptor.js` — читает `document.cookie` по запросу попапа (fallback-путь для страниц, где `chrome.cookies.getAll` недоступен).
- `options/` — настройка имени профиля и URL relay.

## Тесты

```bash
npm test          # jest, покрывает background/extractors.js
npm run test:watch
```

20/20 тестов зелёные на момент последнего обновления (extractors: cookieString, pickCookies, findService, per-service extraction для всех сервисов + generic fallback).

## CI/Release

`.github/workflows/*.yml` — при push тега `v*` собирает ZIP (`manifest.json`, `background/`, `popup/`, `options/`, `content/`, `icons/`) и публикует GitHub Release.

## Claude Code Instructions

- Проектный лог требований: `docs/requirements-log.md` — обновлять при каждом новом требовании/фиче/решении.
- `CLAUDE.md` — симлинк на этот файл (`README.md`), см. глобальные инструкции пользователя.
- Cookie-имена в `background/extractors.js` для Linear и Tilda **не верифицированы** — при появлении багов с этими сервисами сначала проверить реальные cookie через DevTools и обновить `required`/`optional`.
- Не коммитить и не логировать реальные значения токенов/куки — они уходят через relay в GCP Secret Manager, в репозитории им не место.
