import type { AiLogoImportPreferences } from './aiLogoImportPreferences.js'

export interface PhotoToolboxAiLogoImportPreferencesApi {
  getPreferences(): Promise<AiLogoImportPreferences>
  updatePreferences(patch: Partial<Pick<AiLogoImportPreferences, 'maxFileSizeMb' | 'maxFileCount'>>): Promise<AiLogoImportPreferences>
}
