import { expect, test } from "bun:test"
import { createAppFixture } from "./fixture/app"
import { directory, json } from "./fixture/tui-client"
import { waitForHighlightedFrame } from "./fixture/frame"

test.each([
  { width: 140, bar: true, error: false },
  { width: 80, bar: true, error: false },
  { width: 44, bar: true, error: false },
  { width: 140, bar: false, error: false },
  { width: 140, bar: true, error: true },
])("places response metadata in the developer bar (width=$width, bar=$bar, error=$error)", async ({ width, bar, error }) => {
  const session = {
    id: `ses_footer_${width}_${bar}_${error}`,
    projectID: "project",
    title: "Footer fixture",
    agent: "lcs",
    model: { providerID: "demo", id: "model" },
    location: { directory },
    cost: 0,
    time: { created: 1000, updated: 21600 },
  }
  const location = { directory, project: { id: "project", directory, canonical: directory } }
  await using app = await createAppFixture({
    width,
    height: 30,
    config: {
      animations: false,
      tabs: { mode: "off" },
      session: { sidebar: "hide", tps: true },
      debug: { devtools: bar },
    },
    args: { sessionID: session.id },
    fetch: (url) => {
      if (url.pathname === "/api/agent")
        return json({ location, data: [{ id: "lcs", mode: "primary", hidden: false, permissions: [] }] })
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "demo", name: "Demo" }] })
      if (url.pathname === "/api/model")
        return json({
          location,
          data: [
            { id: "model", providerID: "demo", name: "Demo Model", variants: [], limit: { context: 1000000, output: 32000 } },
          ],
        })
      if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
      if (url.pathname === `/api/session/${session.id}/message`)
        return json({
          data: [
            { id: "user", type: "user", text: "Footer test", time: { created: 1000 } },
            {
              id: "answer",
              type: "assistant",
              agent: "lcs",
              model: session.model,
              time: { created: 1000, streamed: 21600, completed: 21600 },
              finish: "stop",
              ...(error ? { error: { type: "unknown", message: "Fixture failure" } } : {}),
              content: [{ type: "text", text: "Reply fixture" }],
              tokens: { input: 10, output: 2490, reasoning: 0, cache: { read: 0, write: 0 } },
            },
          ],
          cursor: {},
        })
      if (url.pathname === `/api/session/${session.id}/inbox`) return json({ data: [] })
    },
  })
  await app.ready
  const frame = await waitForHighlightedFrame(app, (frame) => frame.includes("Reply fixture"))
  await app.waitFor(() => !!app.renderer.currentFocusedEditor)
  expect(app.renderer.currentFocusedEditor!.height).toBe(1)
  if (error) expect(frame).toContain("Error: Fixture failure")
  if (!bar) {
    expect(frame).not.toContain("Experiments")
    expect(frame.match(/Demo Model/g)).toHaveLength(2)
    return
  }
  const bottom = frame.trimEnd().split("\n").at(-1)!
  expect(bottom).toContain("Server")
  expect(frame.split("\n").slice(0, -2).join("\n")).not.toContain("Demo Model")
  if (width === 140) {
    expect(bottom).toContain("Lcs · Demo Model · 20.6s · 120.9 tok/s")
    expect(frame.match(/Demo Model/g)).toHaveLength(1)
  }
})
