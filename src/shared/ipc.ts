// =============================================================================
// IPC contract — channel names and the typed API surface exposed to the
// renderer via the preload bridge. The renderer NEVER touches Node, secrets, or
// the network directly; it only calls these methods, which run in the main
// process.
// =============================================================================

import type {
  AppReadiness,
  JurisdictionRule,
  Lead,
  PipelineProgress,
  PushResult
} from './types'

export const IPC = {
  // readiness / config
  GET_READINESS: 'app:getReadiness',
  GET_JURISDICTIONS: 'app:getJurisdictions',

  // capture pipeline
  SAVE_RECORDING: 'capture:saveRecording', // persist raw WAV FIRST, returns leadId+path
  PROCESS_RECORDING: 'capture:processRecording', // transcribe + extract for a saved capture
  RETRY_PROCESSING: 'capture:retryProcessing',
  PIPELINE_PROGRESS: 'capture:progress', // main -> renderer event

  // leads / backend
  LIST_LEADS: 'leads:list',
  GET_LEAD: 'leads:get',
  UPDATE_LEAD: 'leads:update',
  ANALYZE_CALL: 'leads:analyzeCall',
  ADD_MANUAL_LEAD: 'leads:addManual',
  SOFT_DELETE_LEAD: 'leads:softDelete',
  RESTORE_LEAD: 'leads:restore',
  PERMANENT_DELETE_LEAD: 'leads:permanentDelete',

  // sheets
  PUSH_LEAD: 'sheets:push',
  PUSH_ALL_APPROVED: 'sheets:pushAllApproved',
  DELETE_SHEET_ROW: 'sheets:deleteRow'
} as const

/** Options for listing leads in the Backend. */
export interface ListLeadsOptions {
  includeDeleted?: boolean
  onlyDeleted?: boolean
  search?: string
  status?: Lead['status'] | 'all'
  sortBy?: keyof Lead
  sortDir?: 'asc' | 'desc'
}

/** Payload to persist a freshly recorded clip (raw bytes + metadata). */
export interface SaveRecordingPayload {
  /** Lossless WAV bytes captured in the renderer. */
  wav: ArrayBuffer
  durationSec: number
  sampleRate: number
  channels: number
  deviceLabel: string
  /** Consent context gathered at the gate, logged immutably with the lead. */
  consent: {
    state: string
    method: string
    script_acknowledged: boolean
    audible_played: boolean
  }
}

export interface SaveRecordingResult {
  leadId: string
  audioPath: string
}

/**
 * The full API the preload bridge exposes on window.stoneBridge. Every method
 * is async and resolves with plain (structured-cloneable) data.
 */
export interface StoneBridgeAPI {
  getReadiness(): Promise<AppReadiness>
  getJurisdictions(): Promise<JurisdictionRule[]>

  saveRecording(payload: SaveRecordingPayload): Promise<SaveRecordingResult>
  processRecording(leadId: string): Promise<Lead>
  retryProcessing(leadId: string): Promise<Lead>
  onPipelineProgress(cb: (p: PipelineProgress) => void): () => void

  listLeads(opts?: ListLeadsOptions): Promise<Lead[]>
  getLead(id: string): Promise<Lead | null>
  updateLead(id: string, patch: Partial<Lead>): Promise<Lead>
  analyzeCall(id: string): Promise<Lead>
  addManualLead(patch: Partial<Lead>): Promise<Lead>
  softDeleteLead(id: string): Promise<void>
  restoreLead(id: string): Promise<void>
  permanentDeleteLead(id: string): Promise<void>

  pushLead(id: string): Promise<PushResult>
  pushAllApproved(): Promise<PushResult[]>
  deleteSheetRow(id: string): Promise<{ ok: boolean; error: string | null }>
}
