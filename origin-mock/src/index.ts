import { Hono } from 'hono'
import { html } from 'hono/html'

type Post = {
  title: string
  body: string
}

const posts: Post[] = []

const getTime = () =>
  new Date(Date.now() + (new Date().getTimezoneOffset() + 9 * 60) * 60 * 1000).toLocaleTimeString(
    'ja-JP'
  )
const sleep = (ms: number) => {
  const max = 10000
  if (ms > max) ms = max
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const app = new Hono()

app.get('/', (c) => c.text('root'))

app.get('/posts', (c) => {
  return c.json({
    posts: posts,
    time: getTime(),
  })
})

app.get('/posts/delay', async (c) => {
  const delay = c.req.query('delay') || '1000'
  await sleep(Number(delay))

  return c.json({
    posts: posts,
    time: getTime(),
  })
})

app.post('/posts', async (c) => {
  const post = await c.req.parseBody<Post>()
  posts.push(post)
  return c.redirect('/')
})

export default app
