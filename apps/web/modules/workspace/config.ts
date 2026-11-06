/** The API client appends absolute /v1 paths; prefixes are deliberately unsupported. */
export function workspaceApiOrigin(value: string | undefined, mode: string) {
  const invalid = () => new Error("NEXT_PUBLIC_API_URL")
  const local = mode === "development" || mode === "test"
  if (value === undefined) {
    if (!local) throw invalid()
    return "http://localhost:4300"
  }
  if (
    !/^https?:\/\/[^/]+\/?$/i.test(value) ||
    /[\s\\@?#]/u.test(value) ||
    [...value].some(
      (char) =>
        char.charCodeAt(0) < 32 ||
        (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
    )
  )
    throw invalid()
  try {
    const url = new URL(value)
    if (
      !url.hostname ||
      /:\/?$/.test(value) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        (!local ||
          url.protocol !== "http:" ||
          !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/i.test(
            value
          )))
    )
      throw invalid()
    return url.origin
  } catch {
    throw invalid()
  }
}
