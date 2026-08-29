'use strict';

// Per-service token extractors.
// Knows which cookies matter for each service — sends only auth-relevant ones,
// not the full cookie dump.
//
// Cookie names verified against actual sites where noted.
// Unverified ones (Linear, Tilda) fall back to full dump — update after manual check.

const SERVICES = {
  'figma.com': {
    label: 'figma',
    captureUrl: 'https://www.figma.com',
    // Verified: figma_session is the primary auth cookie
    required: ['figma_session'],
    optional: ['figma_user_id', '__figma_device_id'],
  },

  'notion.so': {
    label: 'notion',
    captureUrl: 'https://www.notion.so',
    // Verified: token_v2 is Notion's internal API auth token
    required: ['token_v2'],
    optional: ['notion_user_id', 'notion_browser_id'],
  },

  'github.com': {
    label: 'github',
    captureUrl: 'https://github.com',
    // Verified: user_session is the primary session cookie
    required: ['user_session'],
    optional: ['dotcom_user', 'logged_in'],
  },

  'linear.app': {
    label: 'linear',
    captureUrl: 'https://linear.app',
    // UNVERIFIED — capture all; inspect with DevTools and update required[] later
    required: [],
    optional: [],
    fullDump: true,
  },

  'tilda.cc': {
    label: 'tilda',
    captureUrl: 'https://tilda.cc',
    // UNVERIFIED — capture all; inspect with DevTools and update required[] later
    required: [],
    optional: [],
    fullDump: true,
  },

  'slack.com': {
    label: 'slack',
    captureUrl: 'https://app.slack.com',
    // Note: real Slack API token is in window.boot_data.api_token (JS context, not cookie)
    // Cookies alone won't give you the xoxs- token — needs content script injection
    required: ['b'],  // Slack session cookie
    optional: ['d', 'x'],
    jsExtract: true,  // flag: popup.js can warn user
  },

  'nalog.ru': {
    label: 'nalog',
    captureUrl: 'https://lknpd.nalog.ru',
    required: [],
    optional: [],
    fullDump: true,
  },
};

// ── Core extraction logic ──────────────────────────────────────────────────────

function pickCookies(cookies, required, optional) {
  const map = new Map(cookies.map(c => [c.name, c.value]));

  for (const key of required) {
    if (!map.has(key)) throw new Error(`Не залогинен — ожидали cookie ${key}`);
  }

  const result = {};
  for (const key of [...required, ...optional]) {
    if (map.has(key)) result[key] = map.get(key);
  }

  return cookieString(result);
}

function allCookies(cookies) {
  const result = {};
  for (const c of cookies) result[c.name] = c.value;
  return cookieString(result);
}

function cookieString(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
}

// Extract token for a given hostname.
// Returns { tokenValue: string, label: string } or throws.
function extractForHost(hostname, cookies) {
  const config = findService(hostname);
  if (!config) {
    // Generic fallback: dump all cookies
    const val = allCookies(cookies);
    if (!val) throw new Error('Куки не найдены — не залогинен?');
    return { tokenValue: val, label: hostname };
  }

  const tokenValue = config.fullDump
    ? allCookies(cookies)
    : pickCookies(cookies, config.required, config.optional);

  if (!tokenValue) throw new Error(`Куки для ${config.label} не найдены — не залогинен?`);
  return { tokenValue, label: config.label };
}

function findService(hostname) {
  for (const [domain, config] of Object.entries(SERVICES)) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return config;
    }
  }
  return null;
}

// ── Export: works in both Chrome SW (globalThis) and Node (Jest) ───────────────

const exports_ = { SERVICES, extractForHost, findService, pickCookies, allCookies, cookieString };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exports_;
} else {
  globalThis.Extractors = exports_;
}
