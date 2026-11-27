export class Problem extends Error {
  constructor(message, { status = 400, code = 'VALIDATION_FAILED' } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function formText(form, key) {
  const values = form.getAll(key)
  const value = values[0] ?? ''
  if (values.length > 1 || typeof value !== 'string') {
    throw new Problem(`Enter a valid value for ${key}.`)
  }
  return value
}

export function field(form, key, limit = 254) {
  const value = formText(form, key).trim()
  if (value.includes('\0')) throw new Problem(`Enter a valid value for ${key}.`)
  if (value.length > limit) throw new Problem(`The ${key} field must be ${limit} characters or fewer.`)
  return value
}

export function integer(value) {
  const number = optionalId(value)
  if (number === null) throw new Problem('Enter a valid positive whole number.')
  return number
}

export function optionalId(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : null
}
