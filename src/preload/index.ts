// =============================================================================
// Preload bridge — exposes a minimal, typed API on window.stoneBridge. The
// renderer can ONLY do what is listed here; it has no direct Node, fs, network,
// or secret access. Everything resolves with structured-cloneable data.
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ListLeadsOptions,
  SaveRecordingPayload,
  SaveRecordingResult,
  StoneBridgeAPI
} from '@shared/ipc'
import type { Lead, PipelineProgress } from '@shared/types'

const api: StoneBridgeAPI = {
  getReadiness: () => ipcRenderer.invoke(IPC.GET_READINESS),
  getJurisdictions: () => ipcRenderer.invoke(IPC.GET_JURISDICTIONS),

  saveRecording: (payload: SaveRecordingPayload): Promise<SaveRecordingResult> =>
    ipcRenderer.invoke(IPC.SAVE_RECORDING, payload),
  processRecording: (leadId: string) => ipcRenderer.invoke(IPC.PROCESS_RECORDING, leadId),
  retryProcessing: (leadId: string) => ipcRenderer.invoke(IPC.RETRY_PROCESSING, leadId),
  onPipelineProgress: (cb: (p: PipelineProgress) => void) => {
    const listener = (_e: unknown, p: PipelineProgress): void => cb(p)
    ipcRenderer.on(IPC.PIPELINE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.PIPELINE_PROGRESS, listener)
  },

  listLeads: (opts?: ListLeadsOptions) => ipcRenderer.invoke(IPC.LIST_LEADS, opts),
  getLead: (id: string) => ipcRenderer.invoke(IPC.GET_LEAD, id),
  updateLead: (id: string, patch: Partial<Lead>) => ipcRenderer.invoke(IPC.UPDATE_LEAD, id, patch),
  analyzeCall: (id: string) => ipcRenderer.invoke(IPC.ANALYZE_CALL, id),
  addManualLead: (patch: Partial<Lead>) => ipcRenderer.invoke(IPC.ADD_MANUAL_LEAD, patch),
  softDeleteLead: (id: string) => ipcRenderer.invoke(IPC.SOFT_DELETE_LEAD, id),
  restoreLead: (id: string) => ipcRenderer.invoke(IPC.RESTORE_LEAD, id),
  permanentDeleteLead: (id: string) => ipcRenderer.invoke(IPC.PERMANENT_DELETE_LEAD, id),

  pushLead: (id: string) => ipcRenderer.invoke(IPC.PUSH_LEAD, id),
  pushAllApproved: () => ipcRenderer.invoke(IPC.PUSH_ALL_APPROVED),
  deleteSheetRow: (id: string) => ipcRenderer.invoke(IPC.DELETE_SHEET_ROW, id)
}

contextBridge.exposeInMainWorld('stoneBridge', api)
