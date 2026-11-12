export interface PixelCakeApplicationInfo {
  platform: 'darwin' | 'win32'
  applicationPath: string
  applicationName: string
  bundleIdentifier?: string
  productName?: string
  publisher?: string
  identity?: {
    sha256: string
    signerStatus?: string
    signerThumbprint?: string
    signerSubject?: string
    fileSize?: number
    lastWriteTimeUtc?: string
    verifiedBy: 'trusted_signer' | 'trusted_hash'
  }
  version: string
  running: boolean
  /** Process probe can be inconclusive even when the bundle is installed. */
  processState?: 'running' | 'not_running' | 'unknown'
  pageState: 'home' | 'editing' | 'modal' | 'unknown'
}

export type CakeCollageWindowsApplicationSelection = Pick<PixelCakeApplicationInfo, 'applicationPath' | 'productName' | 'publisher' | 'version' | 'identity'>

export type CakeCollagePixelCakeHandoffStatus =
  | 'confirmation_required'
  | 'ready'
  | 'submitting'
  | 'request_submitted'
  | 'result_unknown'
  | 'unavailable'
  | 'cancelled'
  | 'failed'

export interface CakeCollagePixelCakeHandoff {
  handoffId: string
  projectId: string
  batchId: string
  fileCount: number
  missingCount: number
  status: CakeCollagePixelCakeHandoffStatus
  application: PixelCakeApplicationInfo | null
  message: string
  attempt: number
  systemAccepted: boolean | null
  createdAt: string
  updatedAt: string
}
