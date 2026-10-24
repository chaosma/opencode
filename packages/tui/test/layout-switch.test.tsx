import { expect, test } from "bun:test"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { createAppFixture } from "./fixture/app"
import { directory, json } from "./fixture/tui-client"

test.each([44, 140])("previews, cancels, and saves dense layout at width %s", async (width) => {
  const session = {
    id: `ses_layout_${width}`,
    projectID: "project",
    title: "Layout fixture",
    agent: "build",
    model: { providerID: "demo", id: "model" },
    location: { directory },
    cost: 0,
    time: { created: 0, updated: 0 },
  }
  const location = { directory, project: { id: "project", directory, canonical: directory } }
  await using app = await createAppFixture({
    width,
    height: 30,
    config: { animations: false, tabs: { mode: "on" }, keybinds: { "layout.switch": "f6" } },
    args: { sessionID: session.id },
    fetch: (url) => {
      if (url.pathname === "/api/agent")
        return json({ location, data: [{ id: "build", mode: "primary", hidden: false, permissions: [] }] })
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "demo", name: "Demo" }] })
      if (url.pathname === "/api/model")
        return json({
          location,
          data: [
            {
              id: "model",
              providerID: "demo",
              name: "Long model name for narrow terminals",
              variants: [],
              cost: [],
              time: { released: 0 },
            },
          ],
        })
      if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
      if (url.pathname === `/api/session/${session.id}/message`)
        return json({
          data: [{ id: "layout-user", type: "user", text: "Layout test message", time: { created: 1 } }],
          cursor: {},
        })
      if (url.pathname === `/api/session/${session.id}/inbox`) return json({ data: [] })
    },
  })
  await app.ready
  await app.waitForFrame((frame) => frame.includes("Layout test message") && frame.includes("Long model"))
  const defaultHeight = app.renderer.root.findDescendantById("layout-user")!.height
  expect(defaultHeight).toBe(3)

  app.mockInput.pressKey("F6")
  await app.waitForFrame(
    (frame) => frame.includes("Layouts") && app.renderer.currentFocusedRenderable instanceof InputRenderable,
  )
  app.mockInput.pressArrow("down")
  await app.waitFor(() => app.renderer.root.findDescendantById("prompt.compact-metadata") !== undefined)
  expect(app.config().layout).toBeUndefined()
  app.mockInput.pressEscape()
  await app.waitFor(() => app.renderer.currentFocusedRenderable instanceof TextareaRenderable)
  expect(app.renderer.root.findDescendantById("prompt.compact-metadata")).toBeUndefined()
  expect(app.renderer.root.findDescendantById("layout-user")!.height).toBe(defaultHeight)
  expect(app.renderer.currentFocusedRenderable!.height).toBe(1)

  app.mockInput.pressKey("F6")
  await app.waitForFrame(
    (frame) => frame.includes("Layouts") && app.renderer.currentFocusedRenderable instanceof InputRenderable,
  )
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await app.waitFor(
    () => app.config().layout === "dense" && app.renderer.currentFocusedRenderable instanceof TextareaRenderable,
  )
  await app.renderOnce()
  expect(app.renderer.currentFocusedRenderable!.height).toBe(2)
  expect(app.renderer.root.findDescendantById("layout-user")!.height).toBe(1)
  const metadata = app.renderer.root.findDescendantById("prompt.compact-metadata")!
  expect(metadata.height).toBe(1)
  const frame = app.captureCharFrame()
  expect(frame).toContain("Long model")
  expect(frame).toContain("commands")
  expect(frame).not.toContain("Layout fixture")
  expect(app.renderer.root.findDescendantById("prompt.footer.location")).toBeUndefined()

  app.events.emit({
    id: "evt_layout_running",
    created: 2,
    type: "session.execution.started",
    durable: { aggregateID: session.id, seq: 0, version: 1 },
    data: { sessionID: session.id },
  })
  await app.waitForFrame((frame) => frame.includes("interrupt"))
  expect(app.renderer.root.findDescendantById("prompt.compact-metadata")).toBeUndefined()
  app.events.emit({
    id: "evt_layout_idle",
    created: 3,
    type: "session.execution.succeeded",
    durable: { aggregateID: session.id, seq: 1, version: 1 },
    data: { sessionID: session.id },
  })
  await app.waitFor(() => app.renderer.root.findDescendantById("prompt.compact-metadata")?.height === 1)
})
