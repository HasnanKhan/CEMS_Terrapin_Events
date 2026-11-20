import { AsyncLocalStorage } from 'node:async_hooks'

const requests = new AsyncLocalStorage()

export function runRequest(ip, callback) {
  const jar = new Map()
  const state = {
    headers: new Headers({ 'x-forwarded-for': ip }),
    cookies: {
      get: name => jar.get(name),
      set: (name, value, options) => jar.set(name, { value, ...options }),
      delete: name => jar.delete(name)
    }
  }
  return requests.run(state, callback)
}

export const cookies = () => requests.getStore().cookies
export const headers = () => requests.getStore().headers
