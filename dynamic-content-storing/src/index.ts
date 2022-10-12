import { Hono } from 'hono'

type Bindings = {
  DYNAMIC_CONTENT_STORE: KVNamespace
  ORIGIN_HOST: string
}

type Metadata = {
  headers: Record<string, string>
  contentType: string
}

const headersToRecord = (headers: Headers) => {
  const kv: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    kv[key] = value
  }
  return kv
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/posts/', async (c) => {
  const originURL = `https://${c.env.ORIGIN_HOST}/posts/`

  let { value, metadata } = await c.env.DYNAMIC_CONTENT_STORE.getWithMetadata<Metadata>(originURL)
  let response: Response

  if (value && metadata) {
    console.log(`${originURL} already is stored`)
    response = new Response(value, { headers: metadata.headers })
  } else {
    console.log(`fetch from ${originURL}`)
    response = await fetch(originURL)
    const { body, headers } = response.clone()
    if (body) {
      console.log(`store ${originURL}`)
      c.executionCtx.waitUntil(
        c.env.DYNAMIC_CONTENT_STORE.put(originURL, body, {
          expirationTtl: 60 * 60,
          metadata: { headers: headersToRecord(headers) },
        })
      )
    }
  }

  return response
})

app.delete('/posts/', async (c) => {
  const originURL = `https://${c.env.ORIGIN_HOST}/posts/`
  c.executionCtx.waitUntil(c.env.DYNAMIC_CONTENT_STORE.delete(originURL))
  return c.redirect('/posts/')
})

app.get('/posts/*', async (c) => {
  const url: URL = new URL(c.req.url)
  const originURL = `https://${c.env.ORIGIN_HOST}${url.pathname}`
  console.log(`fetch from ${originURL}`)
  const response = await fetch(originURL)
  return new Response(response.body, response)
})

export default app
