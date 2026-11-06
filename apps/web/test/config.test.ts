import assert from "node:assert/strict"
import { test } from "node:test"
import { workspaceApiOrigin } from "../modules/workspace/config"

test("production requires an explicit HTTPS origin and normalizes only its root slash", () => {
  for (const value of [
    "https://api.fixture",
    "HTTPS://API.FIXTURE/",
    "https://api.fixture:443/",
  ])
    assert.equal(workspaceApiOrigin(value, "production"), "https://api.fixture")
  assert.equal(
    workspaceApiOrigin("https://[::1]:4400/", "production"),
    "https://[::1]:4400"
  )
  const invalid = [
    undefined,
    "",
    "http://localhost:4300",
    "http://api.fixture",
    "//api.fixture",
    "https:api.fixture",
    "https:/api.fixture",
    "https:///api.fixture",
    "https:////api.fixture",
    "https://api.fixture/v1",
    "https://api.fixture/.",
    "https://api.fixture//",
    "https://user:SECRET@api.fixture",
    "https://@api.fixture",
    "https://:@api.fixture",
    "https://api.fixture?",
    "https://api.fixture#",
    "https://api.fixture/?token=SECRET",
    "https://api.fixture/#SECRET",
    "https://api.fixture\\SECRET",
    "https://api.fixture/\\",
    " https://api.fixture",
    "https://api.fixture ",
    "https://api.\nfixture",
    "https://api.fixture\t",
    "https://api.fixture\u0000",
    "https://api.fixture\u007f",
    "https://api.fixture\u0085",
    "https://api.fixture\u00a0",
    "https://api.fixture:",
    "https://api.fixture:/",
    "https://api.fixture:invalid",
    "https://api.fixture:99999",
    "https://",
    "file://api.fixture",
  ]
  for (const value of invalid)
    assert.throws(() => workspaceApiOrigin(value, "production"), {
      message: "NEXT_PUBLIC_API_URL",
    })
})

test("local development retains absent-value default and explicit canonical loopback HTTP", () => {
  for (const mode of ["development", "test"]) {
    assert.equal(workspaceApiOrigin(undefined, mode), "http://localhost:4300")
    for (const value of [
      "http://localhost:4300/",
      "http://127.0.0.1:4300/",
      "http://[::1]:4300/",
    ])
      assert.equal(workspaceApiOrigin(value, mode), value.slice(0, -1))
    assert.equal(
      workspaceApiOrigin("https://api.fixture/", mode),
      "https://api.fixture"
    )
    for (const value of [
      "",
      "http://api.fixture",
      "http://127.1",
      "http://2130706433",
      "http://localhost:",
      "http://localhost?",
      "http://@localhost",
      "http:///localhost",
      "http://localhost/.",
    ])
      assert.throws(() => workspaceApiOrigin(value, mode), {
        message: "NEXT_PUBLIC_API_URL",
      })
  }
})

test("unrecognized modes cannot enable the development fallback or HTTP exception", () => {
  assert.throws(() => workspaceApiOrigin(undefined, "unknown"), {
    message: "NEXT_PUBLIC_API_URL",
  })
  assert.throws(() => workspaceApiOrigin("http://localhost:4300", "unknown"), {
    message: "NEXT_PUBLIC_API_URL",
  })
  assert.equal(
    workspaceApiOrigin("https://api.fixture", "unknown"),
    "https://api.fixture"
  )
})
