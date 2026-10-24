import { createMemo, onCleanup, onMount } from "solid-js"
import { useLayouts } from "../context/layout"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"

export function DialogLayoutList() {
  const layouts = useLayouts()
  const dialog = useDialog()
  const toast = useToast()
  const initial = layouts.selected()
  const options = createMemo(() =>
    Object.keys(layouts.all())
      .sort()
      .map((name) => ({ title: name, value: name })),
  )
  onMount(() => void layouts.reload().catch(toast.error))
  onCleanup(() => layouts.preview(undefined))
  return (
    <DialogSelect
      title="Layouts"
      searchInTitle
      titlePlaceholder="Search layouts"
      options={options()}
      current={initial}
      onMove={(option) => layouts.preview(option.value)}
      onSelect={(option) => {
        void layouts
          .select(option.value)
          .then(() => dialog.clear())
          .catch(toast.error)
      }}
    />
  )
}
