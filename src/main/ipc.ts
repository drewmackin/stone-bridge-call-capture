// =============================================================================
// IPC registration — the ONLY surface the renderer can reach. Each handler runs
// in the main process where secrets, the database, and the network live.
// Handlers are added per build phase; capture/transcription/extraction/sheets
// handlers are registered by their own modules' wiring (added in later phases).
// =============================================================================

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ListLeadsOptions } from '@shared/ipc'
import type { Lead } from '@shared/types'
import { computeReadiness } from './readiness'
import { getJurisdictions } from './compliance/states'
import {
  addManualLead,
  getLeadById,
  listLeadsRepo,
  permanentDelete,
  restore,
  softDelete,
  updateLeadFields
} from './services/leads-service'
import { registerCaptureIpc } from './services/capture-service'
import { registerSheetsIpc } from './services/sheets-service'
import { analyzeCallCore } from './extraction/scoreCall'

export function registerIpc(): void {
  // --- readiness / config ---
  ipcMain.handle(IPC.GET_READINESS, () => computeReadiness())
  ipcMain.handle(IPC.GET_JURISDICTIONS, () => getJurisdictions())

  // --- leads / backend ---
  ipcMain.handle(IPC.LIST_LEADS, (_e, opts?: ListLeadsOptions) => listLeadsRepo(opts))
  ipcMain.handle(IPC.GET_LEAD, (_e, id: string) => getLeadById(id))
  ipcMain.handle(IPC.UPDATE_LEAD, (_e, id: string, patch: Partial<Lead>) => updateLeadFields(id, patch))
  ipcMain.handle(IPC.ANALYZE_CALL, (_e, id: string) => analyzeCallCore(id))
  ipcMain.handle(IPC.ADD_MANUAL_LEAD, (_e, patch: Partial<Lead>) => addManualLead(patch))
  ipcMain.handle(IPC.SOFT_DELETE_LEAD, (_e, id: string) => softDelete(id))
  ipcMain.handle(IPC.RESTORE_LEAD, (_e, id: string) => restore(id))
  ipcMain.handle(IPC.PERMANENT_DELETE_LEAD, (_e, id: string) => permanentDelete(id))

  // --- capture pipeline (save raw audio to disk first) ---
  registerCaptureIpc()

  // --- google sheets sync ---
  registerSheetsIpc()
}
