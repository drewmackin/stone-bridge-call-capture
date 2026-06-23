import { useState } from 'react'
import TopNav, { type Page } from './components/TopNav'
import Footer from './components/Footer'
import Home from './pages/Home'
import Backend from './pages/Backend'

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('home')
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col bg-parchment">
      <TopNav page={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          {page === 'home' ? (
            <Home
              onOpenBackend={() => setPage('backend')}
              onOpenLead={(id) => {
                setOpenLeadId(id)
                setPage('backend')
              }}
            />
          ) : (
            <Backend initialLeadId={openLeadId} onConsumedInitial={() => setOpenLeadId(null)} />
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
