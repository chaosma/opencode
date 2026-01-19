import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import path from "path"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"
import { MCP } from "../mcp"
import { Skill } from "../skill"
import { ConfigMarkdown } from "../config/markdown"

export namespace Command {
  export const Event = {
    Executed: BusEvent.define(
      "command.executed",
      z.object({
        name: z.string(),
        sessionID: Identifier.schema("session"),
        arguments: z.string(),
        messageID: Identifier.schema("message"),
      }),
    ),
  }

  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      agent: z.string().optional(),
      model: z.string().optional(),
      mcp: z.boolean().optional(),
      // workaround for zod not supporting async functions natively so we use getters
      // https://zod.dev/v4/changelog?id=zfunction
      template: z.promise(z.string()).or(z.string()),
      subtask: z.boolean().optional(),
      hints: z.array(z.string()),
    })
    .meta({
      ref: "Command",
    })

  // for some reason zod is inferring `string` for z.promise(z.string()).or(z.string()) so we have to manually override it
  export type Info = Omit<z.infer<typeof Info>, "template"> & { template: Promise<string> | string }

  export function hints(template: string): string[] {
    const result: string[] = []
    const numbered = template.match(/\$\d+/g)
    if (numbered) {
      for (const match of [...new Set(numbered)].sort()) result.push(match)
    }
    if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
    return result
  }

  export const Default = {
    INIT: "init",
    REVIEW: "review",
  } as const

  const state = Instance.state(async () => {
    const cfg = await Config.get()

    const result: Record<string, Info> = {
      [Default.INIT]: {
        name: Default.INIT,
        description: "create/update AGENTS.md",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", Instance.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      },
      [Default.REVIEW]: {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        get template() {
          return PROMPT_REVIEW.replace("${path}", Instance.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      },
    }

    for (const [name, command] of Object.entries(cfg.command ?? {})) {
      result[name] = {
        name,
        agent: command.agent,
        model: command.model,
        description: command.description,
        get template() {
          return command.template
        },
        subtask: command.subtask,
        hints: hints(command.template),
      }
    }
    for (const [name, prompt] of Object.entries(await MCP.prompts())) {
      result[name] = {
        name,
        mcp: true,
        description: prompt.description,
        get template() {
          // since a getter can't be async we need to manually return a promise here
          return new Promise<string>(async (resolve, reject) => {
            const template = await MCP.getPrompt(
              prompt.client,
              prompt.name,
              prompt.arguments
                ? // substitute each argument with $1, $2, etc.
                  Object.fromEntries(prompt.arguments?.map((argument, i) => [argument.name, `$${i + 1}`]))
                : {},
            ).catch(reject)
            resolve(
              template?.messages
                .map((message) => (message.content.type === "text" ? message.content.text : ""))
                .join("\n") || "",
            )
          })
        },
        hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
      }
    }

    // Add skills as slash commands
    for (const skill of await Skill.all()) {
      // Skip if a command with the same name already exists
      if (result[skill.name]) continue

      result[skill.name] = {
        name: skill.name,
        description: skill.description,
        get template() {
          return new Promise<string>(async (resolve, reject) => {
            try {
              const parsed = await ConfigMarkdown.parse(skill.location)
              const dir = path.dirname(skill.location)
              const content = [
                `## Skill: ${skill.name}`,
                "",
                `**Base directory**: ${dir}`,
                "",
                parsed.content.trim(),
                "",
                "---",
                "",
                "User arguments: $ARGUMENTS",
              ].join("\n")
              resolve(content)
            } catch (err) {
              reject(err)
            }
          })
        },
        hints: ["$ARGUMENTS"],
      }
    }

    return result
  })

  export async function get(name: string) {
    return state().then((x) => x[name])
  }

  export async function list() {
    return state().then((x) => Object.values(x))
  }
}
