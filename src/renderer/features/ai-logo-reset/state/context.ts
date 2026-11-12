import { inject, provide, type InjectionKey } from 'vue'
import type { ResetWorkspace } from './workspace'

const KEY: InjectionKey<ResetWorkspace> = Symbol('ai-logo-reset-workspace')

export const provideWorkspace = (workspace: ResetWorkspace) => provide(KEY, workspace)

export const useWorkspace = (): ResetWorkspace => {
  const workspace = inject(KEY)
  if (!workspace) throw new Error('AI_LOGO_RESET_WORKSPACE_MISSING')
  return workspace
}

/** Opens the system picker through a transient input; resolves with the chosen files. */
export const pickFiles = (options: { accept: string, multiple?: boolean, directory?: boolean }) => new Promise<File[]>(resolve => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = options.accept
  input.multiple = options.multiple ?? true
  if (options.directory) input.setAttribute('webkitdirectory', '')
  input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true })
  input.addEventListener('cancel', () => resolve([]), { once: true })
  input.click()
})

export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
export const LOGO_ACCEPT = '.png,.webp,.svg,image/png,image/webp,image/svg+xml'
