export function testDatabase(value = process.env.TEST_DATABASE_URL, name = 'TEST_DATABASE_URL') {
  const invalid = () => new Error(name + ' must be a plain PostgreSQL URL for an isolated localhost database.')
  let url
  try {
    url = new URL(value)
  } catch {
    throw invalid()
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname.length < 2 || url.search || url.hash) {
    throw invalid()
  }
  url.port ||= '5432'
  return url
}
