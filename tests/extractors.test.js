'use strict';

const { extractForHost, findService, pickCookies, allCookies, cookieString } = require('../background/extractors');

// Helper: build Chrome cookie objects from a plain key→value map
function makeCookies(map) {
  return Object.entries(map).map(([name, value]) => ({ name, value, domain: 'test.com' }));
}

// ── cookieString ───────────────────────────────────────────────────────────────

describe('cookieString', () => {
  test('joins key=value with semicolon', () => {
    expect(cookieString({ a: '1', b: '2' })).toBe('a=1; b=2');
  });

  test('empty object → empty string', () => {
    expect(cookieString({})).toBe('');
  });
});

// ── allCookies ─────────────────────────────────────────────────────────────────

describe('allCookies', () => {
  test('dumps all cookies as string', () => {
    const cookies = makeCookies({ foo: 'bar', baz: 'qux' });
    expect(allCookies(cookies)).toBe('foo=bar; baz=qux');
  });
});

// ── pickCookies ────────────────────────────────────────────────────────────────

describe('pickCookies', () => {
  test('returns required + optional when all present', () => {
    const cookies = makeCookies({
      figma_session: 'sess_abc',
      figma_user_id: 'usr_123',
      noise: 'ignore_me',
    });
    const result = pickCookies(cookies, ['figma_session'], ['figma_user_id']);
    expect(result).toBe('figma_session=sess_abc; figma_user_id=usr_123');
    expect(result).not.toContain('noise');
  });

  test('throws if required cookie is missing', () => {
    const cookies = makeCookies({ other: 'value' });
    expect(() => pickCookies(cookies, ['figma_session'], [])).toThrow('figma_session');
  });

  test('returns required only when optional is absent', () => {
    const cookies = makeCookies({ figma_session: 'sess_xyz' });
    const result = pickCookies(cookies, ['figma_session'], ['figma_user_id']);
    expect(result).toBe('figma_session=sess_xyz');
  });
});

// ── findService ────────────────────────────────────────────────────────────────

describe('findService', () => {
  test('matches exact domain', () => {
    expect(findService('figma.com')?.label).toBe('figma');
  });

  test('matches subdomain', () => {
    expect(findService('www.figma.com')?.label).toBe('figma');
    expect(findService('www.notion.so')?.label).toBe('notion');
  });

  test('returns null for unknown domain', () => {
    expect(findService('example.com')).toBeNull();
  });
});

// ── extractForHost: Figma ─────────────────────────────────────────────────────

describe('Figma extraction', () => {
  test('extracts figma_session cookie', () => {
    const cookies = makeCookies({
      figma_session: 'FIGMA_SESSION_TOKEN',
      figma_user_id: '11223344',
      __cfruid: 'noise',
    });
    const { tokenValue, label } = extractForHost('figma.com', cookies);
    expect(label).toBe('figma');
    expect(tokenValue).toContain('figma_session=FIGMA_SESSION_TOKEN');
    expect(tokenValue).toContain('figma_user_id=11223344');
    expect(tokenValue).not.toContain('__cfruid');
  });

  test('throws if not logged in (no figma_session)', () => {
    const cookies = makeCookies({ __cfruid: 'cf_value' });
    expect(() => extractForHost('figma.com', cookies)).toThrow('figma_session');
  });
});

// ── extractForHost: Notion ────────────────────────────────────────────────────

describe('Notion extraction', () => {
  test('extracts token_v2 cookie', () => {
    const cookies = makeCookies({
      token_v2: 'notion_token_abc123',
      notion_user_id: 'user-uuid-here',
      intercom: 'noise',
    });
    const { tokenValue, label } = extractForHost('notion.so', cookies);
    expect(label).toBe('notion');
    expect(tokenValue).toContain('token_v2=notion_token_abc123');
    expect(tokenValue).not.toContain('intercom');
  });

  test('throws if token_v2 missing', () => {
    const cookies = makeCookies({ notion_user_id: 'user-123' });
    expect(() => extractForHost('notion.so', cookies)).toThrow('token_v2');
  });
});

// ── extractForHost: GitHub ────────────────────────────────────────────────────

describe('GitHub extraction', () => {
  test('extracts user_session cookie', () => {
    const cookies = makeCookies({
      user_session: 'gh_sess_token_xyz',
      dotcom_user: 'kobzevvv',
      logged_in: 'yes',
      _ga: 'analytics_noise',
    });
    const { tokenValue, label } = extractForHost('github.com', cookies);
    expect(label).toBe('github');
    expect(tokenValue).toContain('user_session=gh_sess_token_xyz');
    expect(tokenValue).toContain('dotcom_user=kobzevvv');
    expect(tokenValue).not.toContain('_ga');
  });

  test('throws if user_session missing', () => {
    const cookies = makeCookies({ logged_in: 'no' });
    expect(() => extractForHost('github.com', cookies)).toThrow('user_session');
  });
});

// ── extractForHost: Linear (full dump, unverified cookies) ────────────────────

describe('Linear extraction', () => {
  test('dumps all cookies (unverified service)', () => {
    const cookies = makeCookies({
      LINEAR_AUTH: 'jwt_token_here',
      session: 'sess_value',
      _ga: 'analytics',
    });
    const { tokenValue, label } = extractForHost('linear.app', cookies);
    expect(label).toBe('linear');
    // full dump — all cookies present
    expect(tokenValue).toContain('LINEAR_AUTH=jwt_token_here');
    expect(tokenValue).toContain('_ga=analytics');
  });

  test('throws if no cookies (not logged in)', () => {
    expect(() => extractForHost('linear.app', [])).toThrow('Куки для linear не найдены');
  });
});

// ── extractForHost: Tilda ─────────────────────────────────────────────────────

describe('Tilda extraction', () => {
  test('dumps all cookies (unverified service)', () => {
    const cookies = makeCookies({ tilda_sid: 'tilda_session_abc', user_id: '999' });
    const { tokenValue, label } = extractForHost('tilda.cc', cookies);
    expect(label).toBe('tilda');
    expect(tokenValue).toContain('tilda_sid=tilda_session_abc');
  });
});

// ── extractForHost: unknown domain ────────────────────────────────────────────

describe('Generic fallback', () => {
  test('dumps all cookies for unknown hostname', () => {
    const cookies = makeCookies({ session: 'abc', foo: 'bar' });
    const { tokenValue, label } = extractForHost('someapp.io', cookies);
    expect(label).toBe('someapp.io');
    expect(tokenValue).toContain('session=abc');
  });

  test('throws for unknown domain with no cookies', () => {
    expect(() => extractForHost('empty.io', [])).toThrow('Куки не найдены');
  });
});
