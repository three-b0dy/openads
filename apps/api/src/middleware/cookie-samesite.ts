import { createMiddleware } from "hono/factory"

// better-auth hardcodes SameSite=Lax, blocking cross-origin fetch from sending cookies.
// We rebuild the Response with SameSite=None; Secure so cross-origin requests include it.
export const cookieSameSiteMiddleware = createMiddleware(async (c, next) => {
  await next()

  const original = c.res
  const setCookies = original.headers.getSetCookie()
  if (setCookies.length === 0) return

  const headers = new Headers()
  original.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") headers.append(key, value)
  })
  for (const cookie of setCookies) {
    headers.append("set-cookie", cookie.replace(/;\s*SameSite=Lax/gi, "; SameSite=None; Secure"))
  }

  c.res = new Response(original.body, {
    status: original.status,
    statusText: original.statusText,
    headers,
  })
})
