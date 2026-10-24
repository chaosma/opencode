import { createContext, createMemo, createSignal, onMount, useContext, type ParentProps } from "solid-js"
import { useConfig } from "../config"
import { builtinLayouts, defaultLayout, discoverLayouts } from "../layout"

function createLayouts(directories: string[]) {
  const config = useConfig()
  const [layouts, setLayouts] = createSignal(builtinLayouts)
  const [preview, setPreview] = createSignal<string>()
  const selected = () => preview() ?? config.data.layout ?? "default"
  const current = createMemo(() => layouts()[selected()] ?? layouts().default)
  const reload = async () => setLayouts({ ...builtinLayouts, ...(await discoverLayouts(directories)) })
  onMount(() => void reload().catch((error) => console.warn("Failed to load layouts:", error)))
  return {
    all: layouts,
    current,
    selected,
    preview: setPreview,
    reload,
    async select(name: string) {
      await config.update((draft) => {
        draft.layout = name
      })
      setPreview(undefined)
    },
  }
}

const Context = createContext<ReturnType<typeof createLayouts>>()

export function LayoutProvider(props: ParentProps<{ directories: string[] }>) {
  const layouts = createLayouts(props.directories)
  return <Context.Provider value={layouts}>{props.children}</Context.Provider>
}

export function useLayouts() {
  const layouts = useContext(Context)
  if (!layouts) throw new Error("LayoutProvider is missing")
  return layouts
}

// Standalone components (including plugin previews) retain the standard layout.
export function useLayout() {
  return useContext(Context)?.current ?? (() => defaultLayout)
}
