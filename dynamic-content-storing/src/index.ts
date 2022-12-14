import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { Context } from 'hono'

type Bindings = {
  DYNAMIC_CONTENT_STORE: KVNamespace
  ORIGIN_HOST: string
}

type Metadata = {
  headers: Record<string, string>
}

const headersToRecord = (headers: Headers) => {
  const kv: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    kv[key] = value
  }
  return kv
}

const ttl = 60
const staleTtl = 60 * 60

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())

const createCache = async (
  c: Context<'/', { Bindings: Bindings }>,
  originURL: string,
  response?: Response
) => {
  if (!response) {
    console.log(`fetch from ${originURL}`)
    response = await fetch(originURL)
  }
  const body = await response.arrayBuffer()
  const headers = response.headers
  const headersRecord = headersToRecord(headers)

  console.log(`store stale: ${originURL}`)
  await c.env.DYNAMIC_CONTENT_STORE.put(`stale: ${originURL}`, body, {
    expirationTtl: staleTtl,
    metadata: { headers: headersRecord },
  })

  console.log(`store fresh: ${originURL}`)
  await c.env.DYNAMIC_CONTENT_STORE.put(`fresh: ${originURL}`, body, {
    expirationTtl: ttl,
    metadata: { headers: headersRecord },
  })
}

app.get('/posts/', async (c) => {
  const originURL = `https://${c.env.ORIGIN_HOST}/posts/`

  console.log(`try to get ${originURL} from kv`)
  let { value, metadata } = await c.env.DYNAMIC_CONTENT_STORE.getWithMetadata<Metadata>(
    `fresh: ${originURL}`
  )
  let response: Response

  if (value && metadata) {
    console.log(`${originURL} already is stored`)
    response = new Response(value, { headers: metadata.headers })
  } else {
    let { value, metadata } = await c.env.DYNAMIC_CONTENT_STORE.getWithMetadata<Metadata>(
      `stale: ${originURL}`
    )
    if (value && metadata) {
      console.log(`${originURL} is expired but the stale is found`)
      response = new Response(value, { headers: metadata.headers })
      c.executionCtx.waitUntil(createCache(c, originURL))
    } else {
      console.log(`fetch from ${originURL}`)
      response = await fetch(originURL)
      c.executionCtx.waitUntil(createCache(c, originURL, response))
    }
  }

  return response
})

app.delete('/posts/', async (c) => {
  const originURL = `https://${c.env.ORIGIN_HOST}/posts/`
  // Force delete
  await c.env.DYNAMIC_CONTENT_STORE.delete(`fresh: ${originURL}`)
  await c.env.DYNAMIC_CONTENT_STORE.delete(`stale: ${originURL}`)
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
