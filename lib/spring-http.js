const loopback = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function springOrigin(value) {
  const url = new URL(value)
  const allowedProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && loopback.has(url.hostname))
  if (!allowedProtocol || url.href !== url.origin + '/') throw new Error('Invalid Spring service origin')
  return url.origin
}

export async function springJson(response, maxBytes) {
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (!response.body || type !== 'application/json') {
    await response.body?.cancel()
    throw new Error('Expected Spring JSON response')
  }

  const chunks = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    if (bytes > maxBytes) throw new Error('Spring response exceeded the size limit')
    chunks.push(chunk)
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)))
}
