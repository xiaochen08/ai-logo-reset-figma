/// <reference types="vite/client" />
import type { AiLogoResetApi } from './shared/aiLogoReset'
import type { LogoAssetRecord } from './shared/logoTypes'

declare global {
  interface Window {
    photoToolboxAiLogoReset?: AiLogoResetApi
    __aiLogoDemoPhotoUrls?: Record<string,string>
    photoToolboxLogoAssets?: {
      listLogoAssets(): Promise<{success:boolean,data?:LogoAssetRecord[],error?:string}>
    }
    photoToolboxFiles?: {
      createLogoPreview(localPath:string,options?:{maxEdge:number}): Promise<{success:boolean,data?:{previewDataUrl:string}}>
    }
  }
}
export {}
