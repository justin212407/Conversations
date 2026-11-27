/** Validate raw transport syntax before URL parsing can repair configuration. */
export function parseTransportUrl(value: string): URL | undefined {
  if (
    !/^(?:https?|wss?):\/\/[^/]+/i.test(value) ||
    /[\s\\@?#]/u.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 ||
        (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159)
    )
  )
    return undefined

  const authority = value.slice(value.indexOf("://") + 3).split("/")[0]
  if (!authority || authority.endsWith(":")) return undefined

  try {
    const url = new URL(value)
    if (!url.hostname) return undefined
    return url
  } catch {
    return undefined
  }
}
