/** Cabeçalhos das páginas HTML do consentimento: sem iframe, sem script, sem cache. (Cookies e CSRF do consentimento: biblioteca, `__Host-`, Secure, HttpOnly, SameSite=Lax.) */
export const PAGE_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Strict-Transport-Security': 'max-age=31536000',
}
