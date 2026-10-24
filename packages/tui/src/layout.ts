import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { parse, type ParseError } from "jsonc-parser"
import { isMissingPath } from "./util/config-directories"

// Defaults match the current TUI; old layout files can override the same fields.
export const defaultLayout = {
  messageSeparation: 1,
  userMessagePaddingTop: 1,
  userMessagePaddingBottom: 1,
  assistantMessagePaddingTop: 0,
  assistantMessagePaddingBottom: 0,
  messagePaddingLeft: 2,
  containerPaddingTop: 0,
  containerPaddingBottom: 1,
  containerPaddingLeft: 2,
  containerPaddingRight: 2,
  containerGap: 0,
  toolMarginTop: 1,
  agentInfoMarginTop: 1,
  textIndent: 3,
  toolIndent: 3,
  showHeader: true,
  showFooter: true,
  forceSidebarHidden: false,
  showInputAgentInfo: true,
  showInputBorder: true,
  inputAgentInfoPaddingTop: 1,
  inputMinHeight: 1,
  inputBoxPaddingTop: 1,
  inputBoxPaddingBottom: 0,
}

export type LayoutConfig = typeof defaultLayout

export const builtinLayouts: Record<string, LayoutConfig> = {
  default: defaultLayout,
  dense: {
    ...defaultLayout,
    messageSeparation: 0,
    userMessagePaddingTop: 0,
    userMessagePaddingBottom: 0,
    containerPaddingBottom: 0,
    containerPaddingLeft: 1,
    containerPaddingRight: 1,
    messagePaddingLeft: 1,
    toolMarginTop: 0,
    agentInfoMarginTop: 0,
    textIndent: 2,
    toolIndent: 1,
    showHeader: false,
    showFooter: false,
    forceSidebarHidden: true,
    showInputAgentInfo: false,
    showInputBorder: false,
    inputAgentInfoPaddingTop: 0,
    inputMinHeight: 2,
    inputBoxPaddingTop: 0,
  },
}

const document = Schema.Struct({ config: Schema.Record(Schema.String, Schema.Unknown) })

export function parseLayout(text: string): LayoutConfig {
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length) throw new Error(`Invalid layout JSON at offset ${errors[0].offset}`)
  const config = Schema.decodeUnknownSync(document)(value).config
  return Object.fromEntries(
    Object.entries(defaultLayout).map(([key, fallback]) => {
      const value = config[key]
      const valid =
        typeof fallback === "boolean"
          ? typeof value === "boolean"
          : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      return [key, valid ? value : fallback]
    }),
  ) as LayoutConfig
}

export async function discoverLayouts(directories: string[]) {
  const result: Record<string, LayoutConfig> = {}
  for (const directory of directories) {
    const root = path.join(directory, "layout")
    const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissingPath(error)) return []
      return Promise.reject(error)
    })
    const files = entries
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && /\.jsonc?$/.test(entry.name))
      .map((entry) => path.join(root, entry.name))
      .sort()
    for (const file of files) {
      try {
        result[path.basename(file).replace(/\.jsonc?$/, "")] = parseLayout(await readFile(file, "utf8"))
      } catch (error) {
        console.warn(`Failed to load layout ${file}:`, error)
      }
    }
  }
  return result
}
