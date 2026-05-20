import { useEffect, useMemo, useState } from 'react'
import { Activity, BookOpen, Building2, ChevronRight, Database, Download, FileUp, FolderTree, Library, LogOut, Search, ShieldCheck, Sparkles, Star, Users } from 'lucide-react'
import { api } from './api'
import type { Book, Bookmark, Category, Clinic, DashboardJob, DashboardMetric, DashboardOverview, Department, Highlight, Note, PageText, Placement, Role, SearchHit, User, UserWorkspace } from './types'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [activeView, setActiveView] = useState<'library' | 'admin'>('library')
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [dashboard, setDashboard] = useState<DashboardOverview | null>(null)
  const [workspace, setWorkspace] = useState<UserWorkspace | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.me().then((loadedUser) => {
      setUser(loadedUser)
      return Promise.all([loadBooks(), loadDashboard(), loadWorkspace()])
    }).catch(() => undefined)
  }, [])

  async function loadBooks() {
    setBooks(await api.books())
  }

  async function loadDashboard() {
    setDashboard(await api.dashboardOverview())
  }

  async function loadWorkspace() {
    setWorkspace(await api.workspace())
  }

  async function saveToWorkspace(book: Book) {
    await api.saveMedia(book.id)
    await loadWorkspace()
  }

  async function runSearch() {
    if (!searchQuery.trim()) {
      setSearchHits([])
      await loadBooks()
      return
    }
    const [hits, matchingBooks] = await Promise.all([api.search(searchQuery), api.books(searchQuery)])
    setSearchHits(hits)
    setBooks(matchingBooks)
  }

  if (!user) {
    return <Login onLogin={setUser} error={error} setError={setError} />
  }

  return (
    <div className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-clinic-950 to-clinic-500 p-3 text-white shadow-lg shadow-sky-900/20">
              <Library className="h-6 w-6" />
            </div>
            <div>
              <p className="portal-eyebrow">Klinikportal</p>
              <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">MedLib Fachbibliothek</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {(user.role === 'admin' || user.role === 'librarian') && (
              <button onClick={() => { setActiveView(activeView === 'library' ? 'admin' : 'library'); setSelectedBook(null); }} className="font-semibold text-clinic-700 hover:text-clinic-900 border border-clinic-300 rounded-full px-4 py-2 hover:bg-clinic-50 transition">
                {activeView === 'library' ? 'Zentrale Verwaltung' : 'Zur Bibliothek'}
              </button>
            )}
            <span className="hidden rounded-full bg-clinic-50 px-4 py-2 font-semibold text-clinic-950 sm:inline-flex">{user.full_name} · {user.role}</span>
            <button className="btn-secondary flex items-center gap-2" onClick={() => { api.logout(); setUser(null) }}>
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {activeView === 'library' ? (
        <LibraryHome
          user={user}
          books={books}
          workspace={workspace}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchHits={searchHits}
          selectedBook={selectedBook}
          onRunSearch={runSearch}
          onSelectBook={setSelectedBook}
          onSaveBook={saveToWorkspace}
        />
      ) : (
        <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-8">
          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-clinic-950 via-clinic-700 to-sky-500 p-6 text-white shadow-portal">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">
                <Sparkles className="h-4 w-4" /> Administration
              </div>
              <h2 className="mt-4 text-3xl font-black leading-tight">Zentrale Verwaltung der Bibliothek.</h2>
              <p className="mt-3 text-sm leading-6 text-sky-100">Uploads, OCR-Prozesse, Zuordnung und Benutzerverwaltung liegen bewusst getrennt von der eigentlichen Bibliothek.</p>
            </section>
            <DashboardPanel dashboard={dashboard} onRefresh={loadDashboard} />
            <Stats books={books} />
            <AccountPanel currentUser={user} onUserChanged={setUser} />
          </aside>

          <section className="space-y-6">
            <UploadPanel onUploaded={async () => { await Promise.all([loadBooks(), loadDashboard()]) }} />
            <TaxonomyPanel books={books} onChanged={async () => { await Promise.all([loadBooks(), loadDashboard()]) }} />
            <UserManagementPanel currentUser={user} />
          </section>
        </main>
      )}
    </div>
  )
}

function LibraryHome({ user, books, workspace, searchQuery, setSearchQuery, searchHits, selectedBook, onRunSearch, onSelectBook, onSaveBook }: { user: User; books: Book[]; workspace: UserWorkspace | null; searchQuery: string; setSearchQuery: (value: string) => void; searchHits: SearchHit[]; selectedBook: Book | null; onRunSearch: () => Promise<void>; onSelectBook: (book: Book | null) => void; onSaveBook: (book: Book) => Promise<void> }) {
  const featuredBooks = useMemo(() => [...books].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 6), [books])
  const topSpecialties = useMemo(() => {
    const counts = new Map<string, number>()
    books.forEach((book) => {
      const specialty = book.specialty?.trim() || 'Allgemeinmedizin'
      counts.set(specialty, (counts.get(specialty) ?? 0) + 1)
    })
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)
  }, [books])

  return (
    <main className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
      <section className="portal-card relative overflow-hidden p-6 md:p-8 xl:p-10">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[32rem] bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_58%)] xl:block" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div>
            <p className="portal-eyebrow">Digitale Bibliothek</p>
            <h2 className="mt-3 max-w-4xl text-3xl font-black tracking-tight text-slate-950 md:text-5xl">Willkommen zurück, {user.full_name.split(' ')[0]}. Hier startet die Bibliothek – nicht die Verwaltung.</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">Durchsuche den Bestand wie in einem modernen Fachportal: mit Titelvorschauen, Regalansicht, Sortierung und direktem Zugriff auf relevante Literatur für den Klinikalltag.</p>

            <div className="mt-6 flex flex-wrap gap-3">
              {topSpecialties.map(([specialty, count]) => (
                <span key={specialty} className="rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800">{specialty} · {count}</span>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-clinic-700" />
                <input className="form-control border-white bg-white py-3.5 pl-12" placeholder="Diagnose, Fachgebiet, Autor:in, ISBN oder Therapie suchen …" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void onRunSearch()} />
              </div>
              <button className="btn-primary sm:min-w-40" onClick={() => void onRunSearch()}>Suche starten</button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-xl">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-200">Bestand</p>
              <p className="mt-3 text-4xl font-black">{books.length}</p>
              <p className="text-sm text-slate-300">Bücher & Journale im Portal</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Meine Sammlung</p>
              <p className="mt-3 text-3xl font-black text-slate-950">{workspace?.saved_media.length ?? 0}</p>
              <p className="text-sm text-slate-500">gemerkte Titel</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Merkhilfen</p>
              <p className="mt-3 text-3xl font-black text-slate-950">{(workspace?.bookmarks.length ?? 0) + (workspace?.notes.length ?? 0)}</p>
              <p className="text-sm text-slate-500">Bookmarks & Notizen</p>
            </div>
          </div>
        </div>
      </section>

      {!selectedBook && <FeaturedShelf books={featuredBooks} onSelectBook={(book) => onSelectBook(book)} />}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <section className="portal-card p-6">
            <p className="portal-eyebrow">Benutzerbereich</p>
            <h3 className="mt-3 text-2xl font-black text-slate-950">Meine Bibliothek</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">Merkliste, Bookmarks und Notizen bleiben erreichbar, ohne die Bibliothek mit Administrationsformularen zu überladen.</p>
          </section>
          <WorkspacePanel workspace={workspace} onSelectBook={(book) => onSelectBook(book)} />
        </aside>

        <section className="space-y-6">
          {selectedBook ? (
            <Reader book={selectedBook} query={searchQuery} onBack={() => onSelectBook(null)} onSave={onSaveBook} />
          ) : (
            <BookShelf books={books} hits={searchHits} query={searchQuery} onSelect={onSelectBook} onSave={onSaveBook} />
          )}
        </section>
      </div>
    </main>
  )
}

function FeaturedShelf({ books, onSelectBook }: { books: Book[]; onSelectBook: (book: Book) => void }) {
  if (!books.length) return null

  return (
    <section className="library-shelf mt-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="portal-eyebrow">Neu im Regal</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Titelvorschau mit direktem Einstieg</h3>
        </div>
        <span className="hidden rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 sm:inline-flex">{books.length} aktuelle Zugänge</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {books.map((book) => (
          <button key={book.id} className="featured-book text-left" onClick={() => onSelectBook(book)}>
            <BookCover book={book} />
            <div className="mt-3">
              <p className="line-clamp-2 text-sm font-bold text-slate-950">{book.title}</p>
              <p className="mt-1 text-xs text-slate-500">{book.authors || book.publisher || 'MedLib'}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function WorkspacePanel({ workspace, onSelectBook }: { workspace: UserWorkspace | null; onSelectBook: (book: Book) => void }) {
  if (!workspace) return null
  return (
    <section className="portal-card grid gap-6 p-6">
      <div>
        <div className="mb-3 flex items-center gap-2"><Star className="h-5 w-5 text-clinic-700" /><h3 className="font-bold">Meine Sammlung</h3></div>
        <div className="space-y-2">
          {workspace.saved_media.slice(0, 6).map((entry) => (
            <button key={entry.id} className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left text-sm hover:bg-slate-100 transition" onClick={() => onSelectBook(entry.book)}>
              <BookCover book={entry.book} compact />
              <span><span className="line-clamp-2 font-bold text-slate-900">{entry.book.title}</span><span className="block text-slate-500">{entry.book.media_type === 'journal' ? 'Zeitschrift' : 'Buch'}</span></span>
            </button>
          ))}
          {!workspace.saved_media.length && <p className="text-sm text-slate-500">Noch keine ausgewählten Medien.</p>}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-5">
        <h3 className="mb-3 font-bold">Meine Bookmarks</h3>
        <div className="space-y-2">
          {workspace.bookmarks.slice(0, 6).map((bookmark) => (
            <div key={bookmark.id} className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="font-semibold">{bookmark.book_title}</p><p className="text-slate-500">Seite {bookmark.page_number} · {bookmark.label || 'Lesezeichen'}</p></div>
          ))}
          {!workspace.bookmarks.length && <p className="text-sm text-slate-500">Noch keine Bookmarks.</p>}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-5">
        <h3 className="mb-3 font-bold">Meine Notizen</h3>
        <div className="space-y-2">
          {workspace.notes.slice(0, 6).map((note) => (
            <div key={note.id} className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="font-semibold">{note.book_title}</p><p className="line-clamp-2 text-slate-600">{note.body}</p></div>
          ))}
          {!workspace.notes.length && <p className="text-sm text-slate-500">Noch keine Notizen.</p>}
        </div>
      </div>
    </section>
  )
}

function formatMetricValue(metric: DashboardMetric) {
  if (metric.key === 'storage_bytes') {
    const gigaBytes = metric.value / (1024 ** 3)
    return gigaBytes >= 1 ? `${gigaBytes.toFixed(2)} GB` : `${(metric.value / (1024 ** 2)).toFixed(1)} MB`
  }
  return new Intl.NumberFormat('de-DE').format(metric.value)
}

function jobStatusLabel(status: DashboardJob['status']) {
  return {
    pending: 'Ausstehend',
    running: 'Läuft',
    completed: 'Fertig',
    failed: 'Fehler'
  }[status]
}

function DashboardPanel({ dashboard, onRefresh }: { dashboard: DashboardOverview | null; onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  if (!dashboard) {
    return <section className="portal-card p-6"><p className="text-sm text-slate-500">Dashboard wird geladen …</p></section>
  }

  return (
    <section className="portal-card space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-clinic-700">Operations</p>
          <h2 className="text-2xl font-bold text-slate-950">Dashboard</h2>
        </div>
        <button className="btn-secondary" onClick={refresh}>{refreshing ? 'Aktualisiere …' : 'Aktualisieren'}</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.metrics.map((metric) => (
          <div key={metric.key} className="rounded-2xl bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{formatMetricValue(metric)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-clinic-700" /><h3 className="font-bold">OCR-Jobs</h3></div>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(dashboard.job_status_counts).map(([status, count]) => (
              <div key={status} className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">{jobStatusLabel(status as DashboardJob['status'])}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{count}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {dashboard.recent_jobs.map((job) => (
              <div key={job.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{job.book_title}</p>
                    <p className="text-sm text-slate-500">{job.message || 'OCR-Job ohne Zusatzmeldung'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : job.status === 'failed' ? 'bg-rose-50 text-rose-700' : job.status === 'running' ? 'bg-amber-50 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>{jobStatusLabel(job.status)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${job.status === 'failed' ? 'bg-rose-500' : 'bg-clinic-700'}`} style={{ width: `${job.progress}%` }} /></div>
                <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{job.progress}%</span><span>{new Date(job.updated_at).toLocaleString('de-DE')}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex items-center gap-2"><Database className="h-5 w-5 text-clinic-700" /><h3 className="font-bold">Datenbank-Stats</h3></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dashboard.records_by_table.map((metric) => (
              <div key={metric.key} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{formatMetricValue(metric)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-clinic-700" /><h3 className="font-bold">Letzte Importe</h3></div>
          <div className="space-y-3">
            {dashboard.recent_imports.map((item) => (
              <div key={item.book_id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.authors || item.source_filename}</p>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    <p>{item.page_count} Seiten</p>
                    <p>{item.specialty || 'Ohne Fachgebiet'}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{item.ocr_status ? `${jobStatusLabel(item.ocr_status)} · ${item.ocr_progress ?? 0}%` : 'Noch kein OCR-Job'}</span>
                  <span>{new Date(item.created_at).toLocaleString('de-DE')}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-clinic-700" /><h3 className="font-bold">Bestand nach Fachgebiet</h3></div>
          <div className="space-y-3">
            {dashboard.top_specialties.map((entry) => (
              <div key={entry.specialty}>
                <div className="mb-1 flex items-center justify-between text-sm text-slate-600"><span>{entry.specialty}</span><span>{entry.count}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-clinic-700" style={{ width: `${Math.min(100, entry.count * 10)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

function Login({ onLogin, error, setError }: { onLogin: (user: User) => void; error: string; setError: (value: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit() {
    try {
      await api.login(email, password)
      onLogin(await api.me())
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login fehlgeschlagen')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(8,47,73,0.18),_transparent_28%)]" />
      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_440px]">
        <section className="hidden lg:block">
          <p className="portal-eyebrow">Klinikportal</p>
          <h1 className="mt-4 max-w-2xl text-6xl font-black leading-[1.02] text-slate-950">Fachwissen, das sich wie eine moderne Bibliothek anfühlt.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Volltextsuche, Merklisten und kuratierter Zugriff auf medizinische Literatur – in einer Oberfläche, die eher nach Fachportal als nach Verwaltungsmaske aussieht.</p>
          <div className="mt-10 grid max-w-3xl gap-5 sm:grid-cols-3">
            {[
              ['Journals', 'Aktuelle Ausgaben und Reihen'],
              ['Bücher', 'Lehrbücher und Standardwerke'],
              ['OCR-Suche', 'Kapitel und Inhalte sekundenschnell finden']
            ].map(([title, description], index) => (
              <div key={title} className="rounded-[1.75rem] border border-white/70 bg-white/75 p-4 shadow-lg backdrop-blur">
                <div className={`login-preview-cover login-preview-${index + 1}`} />
                <h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="login-card mx-auto w-full max-w-[28rem] rounded-[2rem] border border-white/80 bg-white/88 p-7 shadow-portal backdrop-blur-xl sm:p-9">
          <div className="mb-8 flex items-center gap-4">
            <div className="rounded-[1.25rem] bg-gradient-to-br from-clinic-950 to-clinic-500 p-3 text-white shadow-lg shadow-sky-900/20"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <p className="portal-eyebrow">MedLib</p>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">Anmelden</h2>
            </div>
          </div>

          <div className="mb-6 rounded-[1.25rem] border border-sky-100 bg-sky-50/70 p-4 text-sm leading-6 text-sky-900">
            Zugriff auf die digitale Klinikbibliothek mit persönlicher Merkliste, Journals und Volltextsuche.
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">E-Mail</label>
              <input className="form-control" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@klinik.de" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">Passwort</label>
              <input className="form-control" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submit()} autoComplete="current-password" placeholder="••••••••" />
            </div>
          </div>

          {error && <p className="mt-5 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

          <button className="btn-primary mt-6 flex w-full items-center justify-center gap-2 py-3.5" onClick={() => void submit()}>
            Einloggen <ChevronRight className="h-4 w-4" />
          </button>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Zugang nur für berechtigte Nutzer:innen der Klinikbibliothek.</p>
        </section>
      </div>
    </div>
  )
}

function Stats({ books }: { books: Book[] }) {
  const pageCount = books.reduce((sum, book) => sum + book.page_count, 0)
  const specialties = new Set(books.map((book) => book.specialty).filter(Boolean)).size
  return (
    <div className="portal-panel grid grid-cols-3 gap-3">
      {[['Bücher', books.length], ['Seiten', pageCount], ['Fächer', specialties]].map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p></div>
      ))}
    </div>
  )
}

function UploadPanel({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      await api.uploadBook(new FormData(event.currentTarget))
      event.currentTarget.reset()
      await onUploaded()
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="portal-panel space-y-3" onSubmit={submit}>
      <h3 className="flex items-center gap-2 font-bold"><FileUp className="h-5 w-5 text-clinic-700" /> Neues Fachbuch</h3>
      <input name="title" required className="form-control" placeholder="Titel" />
      <input name="authors" className="form-control" placeholder="Autor:innen" />
      <input name="publisher" className="form-control" placeholder="Verlag" />
      <select name="media_type" className="form-control" defaultValue="book"><option value="book">Buch</option><option value="journal">Zeitschrift</option></select>
      <div className="grid grid-cols-2 gap-2"><input name="year" type="number" className="form-control" placeholder="Jahr" /><input name="specialty" className="form-control" placeholder="Fachgebiet" /></div>
      <input name="tags" className="form-control" placeholder="Tags, kommagetrennt" />
      <input name="file" type="file" accept="application/pdf" required className="form-control bg-slate-50 text-sm" />
      <button disabled={busy} className="btn-primary w-full">{busy ? 'OCR wird vorbereitet …' : 'Hochladen & OCR starten'}</button>
    </form>
  )
}

function TaxonomyPanel({ books, onChanged }: { books: Book[]; onChanged: () => Promise<void> }) {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])
  const [clinicName, setClinicName] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [selectedClinic, setSelectedClinic] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedBook, setSelectedBook] = useState('')
  const [message, setMessage] = useState('')

  async function loadTaxonomy() {
    const [clinicRows, departmentRows, categoryRows, placementRows] = await Promise.all([api.clinics(), api.departments(), api.categories(), api.placements()])
    setClinics(clinicRows)
    setDepartments(departmentRows)
    setCategories(categoryRows)
    setPlacements(placementRows)
  }

  useEffect(() => { loadTaxonomy() }, [])

  const filteredDepartments = departments.filter((department) => !selectedClinic || department.clinic_id === selectedClinic)
  const filteredCategories = categories.filter((category) => !selectedDepartment || category.department_id === selectedDepartment)

  async function addClinic() {
    if (!clinicName.trim()) return
    await api.createClinic(clinicName.trim())
    setClinicName('')
    await loadTaxonomy()
  }

  async function addDepartment() {
    if (!selectedClinic || !departmentName.trim()) return
    await api.createDepartment(selectedClinic, departmentName.trim())
    setDepartmentName('')
    await loadTaxonomy()
  }

  async function addCategory() {
    if (!selectedDepartment || !categoryName.trim()) return
    await api.createCategory(selectedDepartment, categoryName.trim())
    setCategoryName('')
    await loadTaxonomy()
  }

  async function assignMedia() {
    if (!selectedBook || !selectedClinic || !selectedDepartment) return
    await api.createPlacement({ book_id: selectedBook, clinic_id: selectedClinic, department_id: selectedDepartment, category_id: selectedCategory || null })
    setMessage('Medium wurde einsortiert')
    await Promise.all([loadTaxonomy(), onChanged()])
  }

  return (
    <section className="portal-panel space-y-4">
      <div className="flex items-center gap-2"><FolderTree className="h-5 w-5 text-clinic-700" /><h3 className="font-bold">Struktur & Einsortierung</h3></div>
      <div className="space-y-2">
        <div className="flex gap-2"><input className="form-control min-w-0 flex-1" placeholder="Klinik" value={clinicName} onChange={(event) => setClinicName(event.target.value)} /><button className="btn-secondary px-4" onClick={addClinic}>+</button></div>
        <select className="form-control" value={selectedClinic} onChange={(event) => { setSelectedClinic(event.target.value); setSelectedDepartment(''); setSelectedCategory('') }}><option value="">Klinik wählen</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select>
        <div className="flex gap-2"><input className="form-control min-w-0 flex-1" placeholder="Fachbereich" value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} /><button className="btn-secondary px-4" onClick={addDepartment}>+</button></div>
        <select className="form-control" value={selectedDepartment} onChange={(event) => { setSelectedDepartment(event.target.value); setSelectedCategory('') }}><option value="">Fachbereich wählen</option>{filteredDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
        <div className="flex gap-2"><input className="form-control min-w-0 flex-1" placeholder="Kategorie" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /><button className="btn-secondary px-4" onClick={addCategory}>+</button></div>
        <select className="form-control" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}><option value="">Kategorie optional</option>{filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      </div>
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="h-4 w-4" /> Medium einsortieren</div>
        <select className="form-control" value={selectedBook} onChange={(event) => setSelectedBook(event.target.value)}><option value="">Buch/Zeitschrift wählen</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
        <button className="btn-primary w-full" onClick={assignMedia}>Zuordnen</button>
        {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      </div>
      <div className="max-h-44 space-y-2 overflow-auto border-t pt-4">
        {placements.slice(0, 8).map((placement) => <p key={placement.id} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{placement.clinic_name} / {placement.department_name}{placement.category_name ? ` / ${placement.category_name}` : ''}</p>)}
      </div>
    </section>
  )
}

function AccountPanel({ currentUser, onUserChanged }: { currentUser: User; onUserChanged: (user: User) => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updatedUser = await api.changeOwnPassword(currentPassword, newPassword)
      onUserChanged(updatedUser)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Eigenes Passwort wurde aktualisiert')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Passwort konnte nicht geändert werden')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="portal-panel space-y-3" onSubmit={submit}>
      <h3 className="font-bold">Mein Zugang</h3>
      <p className="text-sm text-slate-500">{currentUser.email}</p>
      <input className="form-control" type="password" placeholder="Aktuelles Passwort" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
      <input className="form-control" type="password" placeholder="Neues Passwort" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required />
      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <button disabled={busy} className="btn-secondary w-full">{busy ? 'Aktualisiere Passwort …' : 'Eigenes Passwort ändern'}</button>
    </form>
  )
}

function UserManagementPanel({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({})
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'reader' as Role
  })

  async function loadUsers() {
    try {
      setLoading(true)
      setUsers(await api.users())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Benutzer konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  function replaceUser(updatedUser: User) {
    setUsers((currentUsers) => currentUsers.map((entry) => entry.id === updatedUser.id ? updatedUser : entry))
    setRoleDrafts((currentDrafts) => ({ ...currentDrafts, [updatedUser.id]: updatedUser.role }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const created = await api.createUser(form)
      setUsers([created, ...users])
      setForm({ email: '', full_name: '', password: '', role: 'reader' })
      setSuccess('Benutzer wurde angelegt')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Benutzer konnte nicht angelegt werden')
    } finally {
      setSaving(false)
    }
  }

  const creatableRoles: Role[] = currentUser.role === 'admin'
    ? ['admin', 'librarian', 'clinician', 'reader']
    : ['clinician', 'reader']

  async function toggleUserStatus(user: User) {
    setError('')
    setSuccess('')
    try {
      const updatedUser = await api.updateUserStatus(user.id, !user.is_active)
      replaceUser(updatedUser)
      setSuccess(`${updatedUser.full_name} wurde ${updatedUser.is_active ? 'aktiviert' : 'deaktiviert'}`)
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Status konnte nicht geändert werden')
    }
  }

  async function resetPassword(user: User) {
    const password = passwordDrafts[user.id]?.trim()
    if (!password) return
    setError('')
    setSuccess('')
    try {
      await api.updateUserPassword(user.id, password)
      setPasswordDrafts((currentDrafts) => ({ ...currentDrafts, [user.id]: '' }))
      setSuccess(`Passwort für ${user.full_name} wurde gesetzt`)
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : 'Passwort konnte nicht gesetzt werden')
    }
  }

  async function updateRole(user: User) {
    const role = roleDrafts[user.id] ?? user.role
    setError('')
    setSuccess('')
    try {
      const updatedUser = await api.updateUserRole(user.id, role)
      replaceUser(updatedUser)
      setSuccess(`Rolle für ${user.full_name} wurde auf ${updatedUser.role} gesetzt`)
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Rolle konnte nicht geändert werden')
    }
  }

  async function deleteUser(user: User) {
    if (!window.confirm(`Soll ${user.full_name} wirklich gelöscht werden?`)) return
    setError('')
    setSuccess('')
    try {
      await api.deleteUser(user.id)
      setUsers((currentUsers) => currentUsers.filter((entry) => entry.id !== user.id))
      setSuccess(`${user.full_name} wurde gelöscht`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Benutzer konnte nicht gelöscht werden')
    }
  }

  function manageableRoles(user: User): Role[] {
    if (currentUser.role === 'admin') return ['admin', 'librarian', 'clinician', 'reader']
    if (user.role === 'clinician' || user.role === 'reader') return ['clinician', 'reader']
    return [user.role]
  }

  function canManageUser(user: User) {
    return currentUser.role === 'admin' || user.role === 'clinician' || user.role === 'reader'
  }

  return (
    <section className="portal-panel space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-clinic-700" />
        <h3 className="font-bold">Benutzerverwaltung</h3>
      </div>
      <form className="space-y-3" onSubmit={submit}>
        <input className="form-control" placeholder="Vollständiger Name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
        <input className="form-control" type="email" placeholder="E-Mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <input className="form-control" type="password" placeholder="Initiales Passwort" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={10} required />
        <select className="form-control" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
          {creatableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Lege Benutzer an …' : 'Benutzer anlegen'}</button>
      </form>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Vorhandene Zugänge</span>
          <button className="font-semibold text-clinic-700" onClick={loadUsers} type="button">Neu laden</button>
        </div>
        <div className="max-h-64 space-y-2 overflow-auto">
          {loading ? <p className="text-sm text-slate-500">Benutzer werden geladen …</p> : users.map((user) => (
            <div key={user.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{user.full_name}</p>
                  <p className="text-slate-500">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{user.is_active ? 'aktiv' : 'inaktiv'}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-clinic-700">{user.role}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 lg:flex-row">
                <select
                  className="rounded-xl border bg-white p-2.5"
                  value={roleDrafts[user.id] ?? user.role}
                  onChange={(event) => setRoleDrafts((currentDrafts) => ({ ...currentDrafts, [user.id]: event.target.value as Role }))}
                  disabled={currentUser.id === user.id || !canManageUser(user)}
                >
                  {manageableRoles(user).map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button className="rounded-xl border px-3 py-2 font-semibold text-clinic-700" onClick={() => updateRole(user)} type="button" disabled={currentUser.id === user.id || !canManageUser(user)}>Rolle setzen</button>
                <input
                  className="flex-1 rounded-xl border bg-white p-2.5"
                  type="password"
                  placeholder="Neues Passwort setzen"
                  value={passwordDrafts[user.id] ?? ''}
                  onChange={(event) => setPasswordDrafts((currentDrafts) => ({ ...currentDrafts, [user.id]: event.target.value }))}
                  disabled={!canManageUser(user)}
                />
                <button className="rounded-xl border px-3 py-2 font-semibold text-clinic-700" onClick={() => resetPassword(user)} type="button" disabled={!canManageUser(user)}>Passwort setzen</button>
                <button className="rounded-xl border px-3 py-2 font-semibold text-slate-700" onClick={() => toggleUserStatus(user)} type="button" disabled={(currentUser.id === user.id && user.is_active) || !canManageUser(user)}>
                  {user.is_active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button className="rounded-xl border px-3 py-2 font-semibold text-rose-700" onClick={() => deleteUser(user)} type="button" disabled={currentUser.id === user.id || !canManageUser(user)}>Löschen</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character)
}

function highlightTerm(value: string, query: string) {
  const escaped = escapeHtml(value)
  if (!query.trim()) return escaped
  return escaped.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
}

function shortTitle(title: string) {
  return title.split(/\s+/).slice(0, 7).join(' ')
}

function coverTheme(book: Book) {
  const themes = [
    'from-[#143a68] via-[#1d5d97] to-[#63b4ff]',
    'from-[#43286b] via-[#6a3ea1] to-[#c084fc]',
    'from-[#0f4c5c] via-[#14798a] to-[#6bd2dc]',
    'from-[#3c2f17] via-[#8f5b1f] to-[#e9b44c]',
    'from-[#1d3b2f] via-[#2f7d58] to-[#7fd1a3]'
  ]
  const signature = `${book.title}${book.specialty ?? ''}`.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return themes[signature % themes.length]
}

function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  return (
    <div className={`${compact ? 'h-28 w-20 rounded-2xl p-3' : 'h-56 w-40 rounded-[1.4rem] p-5'} ${coverTheme(book)} cover-sheen relative flex shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br text-white shadow-xl shadow-slate-900/15`}>
      <div className="absolute left-0 top-0 h-full w-3 bg-black/20" />
      <div className="absolute inset-x-4 top-4 h-px bg-white/30" />
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-sky-100">{book.media_type === 'journal' ? 'Journal' : 'Fachbuch'}</p>
        <h3 className={`${compact ? 'mt-2 text-[0.7rem]' : 'mt-4 text-xl'} line-clamp-4 font-black leading-tight`}>{shortTitle(book.title)}</h3>
      </div>
      <div>
        <p className="line-clamp-1 text-xs font-semibold text-sky-100">{book.specialty || 'Medizin'}</p>
        {!compact && <p className="mt-1 line-clamp-1 text-[0.7rem] text-sky-100/80">{book.publisher || book.authors || 'MedLib'}</p>}
      </div>
    </div>
  )
}

function BookShelf({ books, hits, query, onSelect, onSave }: { books: Book[]; hits: SearchHit[]; query: string; onSelect: (book: Book) => void; onSave: (book: Book) => Promise<void> }) {
  const [mediaFilter, setMediaFilter] = useState<'all' | 'book' | 'journal'>('all')
  const [letterFilter, setLetterFilter] = useState('ALLE')
  const [sortBy, setSortBy] = useState<'title' | 'year' | 'specialty' | 'author'>('title')
  const hitsByBook = useMemo(() => new Map(hits.map((hit) => [hit.book.id, hit])), [hits])

  const sortedBooks = useMemo(() => {
    return [...books]
    .filter((book) => mediaFilter === 'all' || book.media_type === mediaFilter)
    .filter((book) => letterFilter === 'ALLE' || book.title.trim().charAt(0).toUpperCase() === letterFilter)
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'year') return (b.year || 0) - (a.year || 0)
      if (sortBy === 'specialty') return (a.specialty || '').localeCompare(b.specialty || '')
      if (sortBy === 'author') return (a.authors || a.publisher || '').localeCompare(b.authors || b.publisher || '')
      return 0
    })
  }, [books, letterFilter, mediaFilter, sortBy])

  const letters = useMemo(() => ['ALLE', ...new Set(books.map((book) => book.title.trim().charAt(0).toUpperCase()).filter(Boolean))], [books])

  return (
    <section className="portal-card overflow-hidden p-5 md:p-6">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="portal-eyebrow">Bibliothek</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Regalansicht & Bestandsliste</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Wie in einem Fachportal: nach Medium filtern, alphabetisch eingrenzen und anschließend gezielt nach Relevanz sortieren.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
              {[
                ['all', 'Alle'],
                ['journal', 'Zeitschriften'],
                ['book', 'Bücher']
              ].map(([value, label]) => (
                <button key={value} className={`portal-tab ${mediaFilter === value ? 'portal-tab-active' : ''}`} onClick={() => setMediaFilter(value as 'all' | 'book' | 'journal')} type="button">{label}</button>
              ))}
            </div>
            <select className="form-control min-w-[220px] bg-white text-sm font-semibold text-slate-700 shadow-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'title' | 'year' | 'specialty' | 'author')}>
              <option value="title">Sortieren nach Titel</option>
              <option value="year">Sortieren nach Jahr</option>
              <option value="specialty">Sortieren nach Fachgebiet</option>
              <option value="author">Sortieren nach Autor:in</option>
            </select>
          </div>
        </div>
        <div className="alphabet-rail">
          {letters.map((letter) => (
            <button key={letter} className={`alphabet-chip ${letterFilter === letter ? 'alphabet-chip-active' : ''}`} onClick={() => setLetterFilter(letter)} type="button">{letter}</button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{sortedBooks.length} Titel in der aktuellen Auswahl</p>
        <p className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">{query.trim() ? `Suche: ${query}` : 'Alle Ergebnisse'}</p>
      </div>

      <div className="mt-5 space-y-4">
      {sortedBooks.map((book) => {
        const hit = hitsByBook.get(book.id)
        return (
          <article key={book.id} className="portal-list-row group">
            <button className="text-left" onClick={() => onSelect(book)} aria-label={`${book.title} öffnen`}><BookCover book={book} /></button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-clinic-700">
                <span>{book.media_type === 'journal' ? 'Zeitschrift' : 'Buch'}</span>
                <span className="text-slate-300">•</span>
                <span>{book.specialty ?? 'Medizin'}</span>
              </div>
              <button className="mt-2 text-left" onClick={() => onSelect(book)}>
                <h3 className="line-clamp-2 text-2xl font-black leading-tight text-slate-950 group-hover:text-clinic-700">{book.title}</h3>
              </button>
              <p className="mt-2 text-base text-slate-600">{book.authors ?? book.publisher ?? 'Unbekannte Autor:innen'}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{book.year || 'o. J.'}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{book.page_count} Seiten</span>
                {book.publisher && <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{book.publisher}</span>}
              </div>
              {hit?.snippet && <p className="snippet mt-4 line-clamp-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-slate-700" dangerouslySetInnerHTML={{ __html: highlightTerm(hit.snippet, query) }} />}
            </div>
            <div className="flex flex-col gap-3 self-center md:items-end">
              <button className="btn-primary w-full md:min-w-32" onClick={() => onSelect(book)}>Lesen</button>
              <button className="btn-secondary w-full md:min-w-32" onClick={() => void onSave(book)}>Merken</button>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Direktzugriff</span>
            </div>
          </article>
        )
      })}
      {!sortedBooks.length && (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-lg font-bold text-slate-900">Keine Titel in dieser Auswahl.</p>
          <p className="mt-2 text-sm text-slate-500">Passe Filter oder Suchbegriff an, um weitere Medien zu sehen.</p>
        </div>
      )}
      </div>
    </section>
  )
}

function Reader({ book, query, onBack, onSave }: { book: Book; query: string; onBack: () => void; onSave: (book: Book) => Promise<void> }) {
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<PageText | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    api.page(book.id, pageNumber).then(setPage).catch(() => setPage({ page_number: pageNumber, text: 'Für diese Seite liegt noch kein OCR-Text vor. Der OCR-Job läuft ggf. noch.' }))
    api.notes(book.id).then(setNotes)
    api.bookmarks(book.id).then(setBookmarks)
    api.highlights(book.id).then(setHighlights)
  }, [book.id, pageNumber])

  const markedText = useMemo(() => {
    if (!page?.text || !query.trim()) return escapeHtml(page?.text ?? '')
    return highlightTerm(page.text, query)
  }, [page?.text, query])

  async function saveNote() {
    if (!noteText.trim()) return
    const note = await api.createNote(book.id, pageNumber, noteText)
    setNotes([note, ...notes])
    setNoteText('')
  }

  async function saveBookmark() {
    const bookmark = await api.createBookmark(book.id, pageNumber, `Seite ${pageNumber}`)
    setBookmarks([...bookmarks, bookmark])
  }

  async function saveHighlight() {
    const selection = window.getSelection()?.toString().trim()
    if (!selection) return
    const highlight = await api.createHighlight(book.id, pageNumber, selection)
    setHighlights([highlight, ...highlights])
  }

  return (
    <div className="rounded-3xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div><button className="mb-2 text-sm font-semibold text-clinic-700" onClick={onBack}>← Zur Bibliothek</button><h2 className="text-2xl font-bold">{book.title}</h2><p className="text-sm text-slate-500">{book.authors} · {book.publisher} · {book.year}</p></div>
        <div className="flex gap-2"><button className="flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => onSave(book)}><Star className="h-4 w-4" /> Sammeln</button><button className="flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => api.downloadBook(book)}><Download className="h-4 w-4" /> PDF</button></div>
      </div>
      <div className="grid lg:grid-cols-[1fr_320px]">
        <article className="min-h-[720px] border-r bg-slate-100 p-6">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-lg">
            <div className="mb-6 flex items-center justify-between"><button disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Zurück</button><span className="font-semibold">Seite {pageNumber} / {book.page_count || '?'}</span><button disabled={book.page_count > 0 && pageNumber >= book.page_count} onClick={() => setPageNumber(pageNumber + 1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Weiter</button></div>
            <div className="reader-text whitespace-pre-wrap leading-8 text-slate-800" onMouseUp={saveHighlight} dangerouslySetInnerHTML={{ __html: markedText }} />
          </div>
        </article>
        <aside className="space-y-5 p-5">
          <button className="w-full rounded-2xl bg-clinic-700 py-3 font-semibold text-white" onClick={saveBookmark}>Lesezeichen setzen</button>
          <section><h3 className="mb-2 font-bold">Notiz zur Seite</h3><textarea className="h-28 w-full rounded-2xl border p-3" value={noteText} onChange={(event) => setNoteText(event.target.value)} /><button className="mt-2 rounded-xl border px-4 py-2 font-semibold" onClick={saveNote}>Speichern</button></section>
          <section><h3 className="mb-2 font-bold">Meine Lesezeichen</h3>{bookmarks.map((bookmark) => <button key={bookmark.id} className="mb-2 block rounded-xl bg-slate-100 px-3 py-2 text-sm" onClick={() => setPageNumber(bookmark.page_number)}>{bookmark.label}</button>)}</section>
          <section><h3 className="mb-2 font-bold">Markierungen</h3>{highlights.map((highlight) => <p key={highlight.id} className="mb-2 rounded-xl bg-yellow-50 p-3 text-sm">{highlight.selected_text}</p>)}</section>
          <section><h3 className="mb-2 font-bold">Notizen</h3>{notes.map((note) => <p key={note.id} className="mb-2 rounded-xl bg-slate-50 p-3 text-sm"><span className="font-semibold">S. {note.page_number}: </span>{note.body}</p>)}</section>
        </aside>
      </div>
    </div>
  )
}

export default App
