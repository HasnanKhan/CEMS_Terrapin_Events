export class Problem extends Error {}

export function field(form, key, limit = 254) {
  const value = String(form.get(key) ?? '').trim()
  if (value.length > limit) throw new Problem(`The ${key} field must be ${limit} characters or fewer.`)
  return value
}

export function integer(value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 2147483647) throw new Problem('Enter a valid positive whole number.')
  return number
}

export function optionalId(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : null
}
