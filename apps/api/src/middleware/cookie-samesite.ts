import { createMiddleware } from "hono/factory"

// better-auth hardcodes SameSite=Lax, which blocks cross-origin fetch requests
// from sending cookies. This middleware rewrites auth cookies to SameSite=None; Secure
// so the session cookie is included in cross-origin requests from the frontend.
export const cookieSameSiteMiddleware = createMiddleware(async (c, next) => {
  await next()

  const setCookieHeaders = c.res.headers.getSetCookie()
  if (setCookieHeaders.length === 0) return

  c.res.headers.delete("set-cookie")
  for (const cookie of setCookieHeaders) {
    const rewritten = cookie.replace(/;\s*SameSite=Lax/gi, "; SameSite=None; Secure")
    c.res.headers.append("set-cookie", rewritten)
  }
})
