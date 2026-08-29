# Requirements Log — Cloud Auth Bridge

Единый живой лог требований/фич и их статуса. Обновлять при каждом новом требовании, перед `/clear`.

- [реализовано] Chrome MV3 расширение для pairing с Telegram-ботом (`super_personal_assistant_bot`) через 6-значный код
- [реализовано] Token-relay сервер (HTTPS, sslip.io + Let's Encrypt) как посредник между ботом и расширением, токены складываются в GCP Secret Manager
- [реализовано] Adaptive polling — 3 мин alarm в простое, 1 мин в активном режиме после получения команды (через `chrome.alarms`, не `setInterval`)
- [реализовано] `waitForTabLoad` паттерн — весь capture-флоу держит service worker живым внутри alarm handler chain
- [реализовано] Ручной захват токена из попапа (кнопка «Передать токен» на текущей вкладке)
- [реализовано] Быстрый захват для GitHub, Figma, Notion, Linear, Tilda, Claude (deep-link кнопки в попапе)
- [реализовано] Per-service извлечение куки (`background/extractors.js`) — не дампим все куки, а берём только auth-релевантные, где сервис верифицирован (Figma, Notion, GitHub)
- [реализовано] Multi-profile support — имя профиля auto-detect по Google-аккаунту Chrome (`chrome.identity`), можно переопределить в настройках; токены идут с префиксом `<profile>.<label>`
- [реализовано] Zero-touch auth flow для Claude OAuth — content-script `auto-authorize.js` сам кликает Authorize на `claude.ai/oauth/authorize` и `claude.com/cai/oauth/authorize`
- [реализовано] Debug-логирование на relay (`/debug` endpoint) — видно в journalctl без открытой консоли service worker
- [реализовано] GitHub Actions release workflow — сборка ZIP и публикация GitHub Release на push тега `v*`
- [реализовано] Jest-тесты для extractors.js — 20/20 проходят (cookieString, pickCookies, findService, per-service extraction, generic fallback)
- [в работе / не верифицировано] Cookie-имена для Linear и Tilda не подтверждены реальным логином — используется полный dump куки как временное решение; нужно проверить через DevTools и сузить до конкретных auth-cookie
- [планируется] Slack — реальный API-токен (`xoxs-`) лежит в JS-контексте (`window.boot_data.api_token`), не в cookie; текущий экстрактор берёт только session-cookie `b`, для полноценной интеграции нужна инъекция content-script на страницу Slack
- [реализовано] 2026-08-29: README.md обновлён под актуальную архитектуру v1.2 (было — устаревший текст "Alesa Auth Extension" с описанием старого relay-флоу); добавлен симлинк `CLAUDE.md → README.md`
- [реализовано] 2026-08-29: `__tests__/` → `tests/` — Chrome "Load unpacked" отказывался грузить расширение ("Cannot load extension with file or directory name __tests__. Filenames starting with \"_\" are reserved for use by the system"). Jest `testMatch` в package.json обновлён на `**/tests/**/*.test.js`, все 20 тестов проходят
