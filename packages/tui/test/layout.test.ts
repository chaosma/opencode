import { expect, test } from "bun:test"
import path from "node:path"
import { unlink } from "node:fs/promises"
import { Schema } from "effect"
import { builtinLayouts, defaultLayout, discoverLayouts, parseLayout } from "../src/layout"
import { Info } from "../src/config"
import { configDirectories } from "../src/util/config-directories"
import { tmpdir } from "./fixture/fixture"

test("loads old JSONC layouts with partial overrides and safe defaults", () => {
  const layout = parseLayout(`{
    // Existing layout files can keep their name and description.
    "name": "compact",
    "config": {
      "messageSeparation": 0,
      "showInputAgentInfo": false,
      "inputBoxPaddingBottom": 1,
      "toolIndent": -1,
      "textIndent": 1.5,
      "showHeader": "false",
      "containerGap": null,
      "futureField": 3,
    },
  }`)
  expect(layout).toEqual({
    ...defaultLayout,
    messageSeparation: 0,
    showInputAgentInfo: false,
    inputBoxPaddingBottom: 1,
  })
  expect(() => parseLayout('{"config":')).toThrow()
  expect(() => parseLayout('{"config": null}')).toThrow()
  expect(() => parseLayout("{}")).toThrow()
  expect(builtinLayouts.dense.showInputBorder).toBeFalse()
  expect(Schema.decodeUnknownSync(Info)({ layout: "compact" }).layout).toBe("compact")
})

test("discovers global and ancestor layouts, prefers the closest project, and reloads deletions", async () => {
  await using root = await tmpdir()
  const global = path.join(root.path, "config")
  const project = path.join(root.path, "project")
  const cwd = path.join(project, "nested")
  const file = path.join(cwd, ".opencode/layout/custom.jsonc")
  await Bun.write(path.join(global, "layout/custom.json"), '{"config":{"textIndent":4}}')
  await Bun.write(path.join(project, ".opencode/layout/custom.json"), '{"config":{"textIndent":5}}')
  await Bun.write(file, '{"config":{"textIndent":6}}')
  await Bun.write(path.join(global, "layout/ignored.txt"), '{"config":{"textIndent":7}}')
  const directories = configDirectories(global, cwd)
  expect((await discoverLayouts(directories)).custom.textIndent).toBe(6)
  expect(Object.keys(await discoverLayouts(directories))).toEqual(["custom"])
  await Bun.write(file, '{"config":{"textIndent":8}}')
  expect((await discoverLayouts(directories)).custom.textIndent).toBe(8)
  await unlink(file)
  expect((await discoverLayouts(directories)).custom.textIndent).toBe(5)
  expect(defaultLayout.textIndent).toBe(3)
})
