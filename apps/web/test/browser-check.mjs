export default async function checkWorkspace(page) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => {
    globalThis.fixtureMicRequests = 0
    if (globalThis.navigator.mediaDevices)
      globalThis.navigator.mediaDevices.getUserMedia = async () => {
        globalThis.fixtureMicRequests++
        throw new Error("No microphone in text fixture")
      }
  })
  await page
    .getByRole("link", { name: "A debugger's notebook", exact: true })
    .click()
  await page.waitForFunction(
    () =>
      globalThis.document.querySelectorAll("article[data-message-id]")
        .length === 50
  )
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click()
  await page.waitForFunction(
    () =>
      globalThis.document.querySelectorAll("article[data-message-id]")
        .length === 60
  )
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .first()
    .click()
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Test a boundary condition")
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .press("Control+Enter")
  await page.waitForFunction(() =>
    globalThis.workspaceFixture.store
      .snapshot()
      .conversation.messages.some(
        (m) => m.state === "completed" && m.role === "assistant"
      )
  )
  if ((await page.locator('article[aria-label="Your message"]').count()) !== 1)
    throw new Error("Duplicate first user turn")
  await page.evaluate(() => globalThis.workspaceFixture.failNext())
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Check failure")
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .press("Control+Enter")
  await page
    .getByText("The response could not be completed.", { exact: true })
    .waitFor()
  await page
    .getByRole("button", { name: "Retry response", exact: true })
    .click()
  await page.waitForFunction(
    () =>
      globalThis.workspaceFixture.store
        .snapshot()
        .conversation.messages.filter(
          (m) => m.state === "completed" && m.role === "assistant"
        ).length === 2
  )
  if ((await page.locator('article[aria-label="Your message"]').count()) !== 2)
    throw new Error("Retry duplicated user turn")
  await page.evaluate(() => globalThis.workspaceFixture.loseNext())
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Verify delivery")
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .press("Control+Enter")
  await page.waitForFunction(
    () =>
      globalThis.workspaceFixture.store.snapshot().intent &&
      !globalThis.workspaceFixture.store.snapshot().sending
  )
  await page
    .getByRole("button", { name: "Check delivery", exact: true })
    .click()
  await page.waitForFunction(
    () =>
      globalThis.workspaceFixture.store.snapshot().intent === null &&
      !globalThis.workspaceFixture.store.snapshot().conversation.activeOperation
  )
  if ((await page.locator('article[aria-label="Your message"]').count()) !== 3)
    throw new Error("Delivery replay duplicated user turn")
  await page
    .getByRole("button", { name: "Conversation actions", exact: true })
    .click()
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Boundary notebook")
  await page.getByRole("button", { name: "Save title", exact: true }).click()
  await page
    .getByRole("heading", { name: "Boundary notebook", exact: true })
    .waitFor()
  await page
    .getByRole("button", { name: "Conversation actions", exact: true })
    .click()
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click()
  await page
    .getByText("Unarchive this conversation to continue.", { exact: true })
    .waitFor()
  await page.getByRole("button", { name: "Unarchive", exact: true }).click()
  await page.getByRole("textbox", { name: "Message", exact: true }).waitFor()
  await page.evaluate(() => globalThis.workspaceFixture.disconnect())
  await page
    .getByText("Connection lost. Reconnecting…", { exact: true })
    .first()
    .waitFor()
  await page.evaluate(() => globalThis.workspaceFixture.reconnect())
  await page.waitForFunction(
    () => globalThis.workspaceFixture.store.snapshot().phase === "live"
  )
  await page.screenshot({ path: "/tmp/workspace-desktop-22.png" })
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole("button", { name: "Toggle conversations sidebar", exact: true })
    .click()
  await page.getByRole("dialog").waitFor()
  await page
    .getByRole("link", { name: "A debugger's notebook", exact: true })
    .click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await page.getByRole("textbox", { name: "Message", exact: true }).waitFor()
  const box = await page
    .getByRole("textbox", { name: "Message", exact: true })
    .boundingBox()
  const size = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    scroll: globalThis.document.documentElement.scrollWidth,
    mic: globalThis.fixtureMicRequests,
  }))
  if (size.scroll > size.width + 1 || !box || box.y + box.height > 844)
    throw new Error("Mobile overflow or unreachable composer")
  if (size.mic !== 0) throw new Error("Text flow requested microphone")
  await page.screenshot({ path: "/tmp/workspace-mobile-22.png" })
  return {
    checks: [
      "older history",
      "keyboard send",
      "failed response retry",
      "uncertain delivery replay",
      "rename",
      "archive/unarchive",
      "reconnect feedback",
      "mobile navigation/composer",
    ],
    microphoneRequests: size.mic,
    horizontalOverflow: false,
  }
}
