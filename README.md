# Alesa Auth Extension

Chrome MV3 расширение для привязки браузера к Telegram-боту [Alesa](https://github.com/trained-assist/trained-assist-server-connect).

## Установка (developer mode)

1. Открой `chrome://extensions/`
2. Включи **Developer mode** (верхний правый угол)
3. Нажми **Load unpacked** → выбери папку `alesa-auth-extension/`

## Использование

1. В Telegram-боте напиши `/chromeext_connect` — получи 6-значный код
2. Кликни на иконку расширения в браузере
3. Введи код → нажми **Подключить**
4. Перейди на нужный сайт — появится кнопка **Передать токен**

## Настройки

Иконка расширения → `⚙️` → укажи URL `token-relay` сервера (по умолчанию `http://localhost:8081`).

## Архитектура

```
Telegram bot  ←→  token-relay (:8081)  ←→  Chrome Extension
                        ↑
                   GCP Secret Manager
```

- `background/service-worker.js` — хранит `pairingToken`, проксирует запросы к relay
- `popup/` — UI: ввод кода, статус, кнопка передачи токена
- `content/interceptor.js` — читает `document.cookie` по запросу popup
- `options/` — настройка URL relay
