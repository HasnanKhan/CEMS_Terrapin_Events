export function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/headers') {
    return { url: new URL('./request.js', import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
