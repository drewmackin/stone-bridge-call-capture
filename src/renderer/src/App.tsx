import { useCallback, useEffect, useRef, useState } from 'react'
import type { JurisdictionRule } from '@shared/types'
import Toolbar, { type Page } from './components/Toolbar'
import Footer from './components/Footer'
import ConfirmDialog from './components/ConfirmDialog'
import RecordPage from './pages/Record'
import LeadsPage from './pages/Leads'
import { useReadiness } from './hooks/useReadiness'
import { useRecorder, type ConsentPayload } from './hooks/useRecorder'

/** Returns true when leaving now would throw away unsaved edits. */
export type LeaveGuard = () => boolean

/**
 * App root. The recorder lives HERE, not in a page, so moving between Record and
 * Leads mid-call never touches the live recording (the old layout discarded the
 * call when its page unmounted). While a call is recording — or a finished call
 * is still unsaved — closing or reloading the window is intercepted.
 */
export default function App(): JSX.Element {
  const ready = useReadiness()
  const audioMode = ready.readiness?.audioMode ?? 'speakerphone'
  const operatorState = ready.readiness?.operatorState ?? ''
  const rec = useRecorder(audioMode)

  const [page, setPage] = useState<Page>('record')
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRule[]>([])
  const [leadState, setLeadState] = useState('')
  const [version, setVersion] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null)
  const leaveGuard = useRef<LeaveGuard | null>(null)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    window.stoneBridge.getJurisdictions().then(setJurisdictions).catch(() => setJurisdictions([]))
  }, [])

  // Default the seller's state to the operator's home state once it's known
  // (readiness loads async) — without overriding a state already picked.
  useEffect(() => {
    if (operatorState) setLeadState((s) => s || operatorState)
  }, [operatorState])

  // New lead saved / finished / failed → lists and counts refresh.
  const stage = rec.state.progress?.stage
  const progressLead = rec.state.progress?.leadId
  useEffect(() => {
    if (progressLead && (stage === 'transcribing' || stage === 'done' || stage === 'error')) bump()
  }, [progressLead, stage, bump])

  useEffect(() => {
    let active = true
    window.stoneBridge
      .listLeads({ status: 'new' })
      .then((rows) => active && setReviewCount(rows.length))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [version, page])

  // Closing/reloading mid-call would lose the audio: cancel the unload (main
  // then asks the operator what to do).
  const holdingAudio = rec.state.recording || !!rec.state.saveError
  useEffect(() => {
    if (!holdingAudio) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      e.returnValue = false
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [holdingAudio])

  /** Run a navigation, asking first if an open lead has unsaved edits. */
  const guarded = useCallback((go: () => void) => {
    if (leaveGuard.current?.()) setPendingNav(() => go)
    else go()
  }, [])

  const navigate = useCallback(
    (p: Page) =>
      guarded(() => {
        setPage(p)
        if (p === 'leads') setOpenLeadId(null)
      }),
    [guarded]
  )
  const openLead = useCallback(
    (id: string) =>
      guarded(() => {
        setOpenLeadId(id)
        setPage('leads')
      }),
    [guarded]
  )

  // Each screen opens at its top (the scroll container is shared).
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [page, openLeadId])

  const consent: ConsentPayload = {
    state: leadState,
    method: 'verbal notice given on the call',
    script_acknowledged: false,
    audible_played: false
  }

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <Toolbar
        page={page}
        onNavigate={navigate}
        reviewCount={reviewCount}
        recording={rec.state.recording}
        elapsedSec={rec.state.elapsedSec}
        readiness={ready.readiness}
        readinessError={ready.error}
        checking={ready.checking}
        onRecheck={ready.reload}
      />
      <main
        id="main"
        className="h-full overflow-y-auto pb-[calc(var(--footer-h)+32px)] pt-[calc(var(--toolbar-h)+20px)]"
      >
        <div className="mx-auto w-full max-w-[1080px] px-6">
          {page === 'record' ? (
            <RecordPage
              rec={rec}
              consent={consent}
              leadState={leadState}
              onLeadStateChange={setLeadState}
              jurisdictions={jurisdictions}
              operatorState={operatorState}
              readiness={ready.readiness}
              version={version}
              onOpenLead={openLead}
              onOpenLeads={() => navigate('leads')}
            />
          ) : (
            <LeadsPage
              openLeadId={openLeadId}
              onOpenLead={(id) => guarded(() => setOpenLeadId(id))}
              onCloseLead={() => setOpenLeadId(null)}
              version={version}
              onDataChanged={bump}
              leaveGuard={leaveGuard}
            />
          )}
        </div>
      </main>
      <Footer />

      {pendingNav && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You edited this lead but didn’t save. Leaving now throws those edits away."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          onCancel={() => setPendingNav(null)}
          onConfirm={() => {
            leaveGuard.current = null
            const go = pendingNav
            setPendingNav(null)
            go()
          }}
        />
      )}
    </div>
  )
}
