import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import path from "node:path"
import { ConfigProvider, resolve, type Info } from "../../src/config"
import { LayoutProvider, useLayouts } from "../../src/context/layout"
import { tmpdir } from "../fixture/fixture"

test("restores custom layouts, reloads edits, and falls back when a saved layout is missing", async () => {
  await using root = await tmpdir()
  const file = path.join(root.path, "layout/custom.jsonc")
  await Bun.write(file, '{"config":{"textIndent":7}}')
  const settings: Info = { layout: "custom" }
  let layouts!: ReturnType<typeof useLayouts>
  function Probe() {
    layouts = useLayouts()
    return <text>{layouts.current().textIndent}</text>
  }
  const app = await testRender(
    () => (
      <ConfigProvider
        config={resolve(settings, { terminalSuspend: true })}
        service={{
          get: async () => settings,
          update: async (update) => {
            update(settings)
            return settings
          },
        }}
      >
        <LayoutProvider directories={[root.path]}>
          <Probe />
        </LayoutProvider>
      </ConfigProvider>
    ),
    { width: 44, height: 3 },
  )
  try {
    await layouts.reload()
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("7")
    layouts.preview("dense")
    expect(settings.layout).toBe("custom")
    layouts.preview(undefined)
    expect(layouts.current().textIndent).toBe(7)
    await Bun.write(file, '{"config":{"textIndent":9}}')
    await layouts.reload()
    expect(layouts.current().textIndent).toBe(9)
    await layouts.select("missing")
    expect(layouts.selected()).toBe("missing")
    expect(layouts.current().textIndent).toBe(3)
    await layouts.select("dense")
    expect(settings.layout).toBe("dense")
  } finally {
    app.renderer.destroy()
  }
})
