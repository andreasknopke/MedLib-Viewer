import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity,
  BookOpen,
  Building2,
  ChevronRight,
  Database,
  Download,
  FileUp,
  FolderTree,
  Library,
  LogOut,
  Minus,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { TextLayer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import { api } from './api'
import type { InspectMetadata, InspectResponse } from './api'
import type {
  Book,
  Bookmark,
  Category,
  Clinic,
  DashboardJob,
  DashboardMetric,
  DashboardOverview,
  Department,
  Highlight,
  Note,
  PageText,
  Placement,
  Role,
  SearchHit,
  User,
  UserWorkspace,
} from './types'

GlobalWorkerOptions.workerSrc = pdfWorker

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
    api
      .me()
      .then((loadedUser) => {
        setUser(loadedUser)
        return Promise.all([loadBooks(), loadWorkspace()])
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!user) return
    if (activeView !== 'admin') return
    if (user.role !== 'admin' && user.role !== 'librarian') return
    void loadDashboard()
  }, [activeView, user])

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

  const canAdmin = user.role === 'admin' || user.role === 'librarian'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sidebar hidden lg:flex lg:flex-col">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Library className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">MedLib</p>
              <p className="text-[11px] text-slate-500">Klinikbibliothek</p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            <button
              type="button"
              className={`nav-item ${activeView === 'library' ? 'nav-item-active' : ''}`}
              onClick={() => {
                setActiveView('library')
                setSelectedBook(null)
              }}
            >
              <BookOpen className="h-4 w-4" /> Bibliothek
            </button>
            {canAdmin && (
              <button
                type="button"
                className={`nav-item ${activeView === 'admin' ? 'nav-item-active' : ''}`}
                onClick={() => {
                  setActiveView('admin')
                  setSelectedBook(null)
                }}
              >
                <Settings className="h-4 w-4" /> Verwaltung
              </button>
            )}
            <div className="my-2 border-t border-slate-100" />
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Konto
            </p>
            <div className="px-3 py-2 text-xs leading-tight">
              <p className="font-medium text-slate-900">{user.full_name}</p>
              <p className="text-slate-500">{user.email}</p>
              <span className="badge badge-indigo mt-2">{user.role}</span>
            </div>
            <button
              type="button"
              className="nav-item mt-auto"
              onClick={() => {
                api.logout()
                setUser(null)
              }}
            >
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
          </nav>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
                  <Library className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900">MedLib</span>
              </div>
              <div className="hidden lg:block">
                <h1 className="text-sm font-semibold text-slate-900">
                  {activeView === 'library' ? 'Bibliothek' : 'Verwaltung'}
                </h1>
                <p className="text-xs text-slate-500">
                  {activeView === 'library'
                    ? 'Bestand durchsuchen, lesen und sammeln'
                    : 'Uploads, Struktur und Benutzer verwalten'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canAdmin && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary lg:hidden"
                    onClick={() => {
                      setActiveView(activeView === 'library' ? 'admin' : 'library')
                      setSelectedBook(null)
                    }}
                  >
                    {activeView === 'library' ? 'Verwaltung' : 'Bibliothek'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost lg:hidden"
                  onClick={() => {
                    api.logout()
                    setUser(null)
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
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
              <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
                <div className="space-y-5">
                  <DashboardPanel dashboard={dashboard} onRefresh={loadDashboard} />
                  <Stats books={books} />
                  <AccountPanel currentUser={user} onUserChanged={setUser} />
                </div>
                <div className="space-y-5">
                  <UploadPanel
                    onUploaded={async () => {
                      await Promise.all([loadBooks(), loadDashboard()])
                    }}
                  />
                  <TaxonomyPanel
                    books={books}
                    onChanged={async () => {
                      await Promise.all([loadBooks(), loadDashboard()])
                    }}
                  />
                  <UserManagementPanel currentUser={user} />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function LibraryHome({
  user,
  books,
  workspace,
  searchQuery,
  setSearchQuery,
  searchHits,
  selectedBook,
  onRunSearch,
  onSelectBook,
  onSaveBook,
}: {
  user: User
  books: Book[]
  workspace: UserWorkspace | null
  searchQuery: string
  setSearchQuery: (value: string) => void
  searchHits: SearchHit[]
  selectedBook: Book | null
  onRunSearch: () => Promise<void>
  onSelectBook: (book: Book | null) => void
  onSaveBook: (book: Book) => Promise<void>
}) {
  const featuredBooks = useMemo(
    () =>
      [...books]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, 6),
    [books],
  )
  const topSpecialties = useMemo(() => {
    const counts = new Map<string, number>()
    books.forEach((book) => {
      const specialty = book.specialty?.trim() || 'Allgemeinmedizin'
      counts.set(specialty, (counts.get(specialty) ?? 0) + 1)
    })
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6)
  }, [books])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Willkommen, {user.full_name.split(' ')[0]}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Durchsuche die Fachbibliothek und lege Titel in deiner persönlichen Merkliste ab.
        </p>
      </div>

      <div className="card">
        <div className="card-body flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="form-control h-10 pl-9"
              placeholder="Titel, Autor:in, Fachgebiet, ISBN, Volltext …"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void onRunSearch()}
            />
          </div>
          <button className="btn btn-primary sm:w-32" onClick={() => void onRunSearch()}>
            Suchen
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Bestand" value={books.length} hint="Bücher & Journale" />
        <StatTile label="Meine Sammlung" value={workspace?.saved_media.length ?? 0} hint="gemerkte Titel" />
        <StatTile
          label="Lesezeichen"
          value={workspace?.bookmarks.length ?? 0}
          hint="Bookmarks gesamt"
        />
        <StatTile label="Notizen" value={workspace?.notes.length ?? 0} hint="persönliche Notizen" />
      </div>

      {topSpecialties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topSpecialties.map(([specialty, count]) => (
            <span key={specialty} className="badge badge-slate">
              {specialty} · {count}
            </span>
          ))}
        </div>
      )}

      {!selectedBook && <FeaturedShelf books={featuredBooks} onSelectBook={(book) => onSelectBook(book)} />}

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-5">
          <WorkspacePanel workspace={workspace} onSelectBook={(book) => onSelectBook(book)} />
        </aside>
        <section>
          {selectedBook ? (
            <Reader book={selectedBook} query={searchQuery} onBack={() => onSelectBook(null)} onSave={onSaveBook} />
          ) : (
            <BookShelf books={books} hits={searchHits} query={searchQuery} onSelect={onSelectBook} onSave={onSaveBook} />
          )}
        </section>
      </div>
    </div>
  )
}

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card">
      <div className="card-body py-3.5">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}

function FeaturedShelf({ books, onSelectBook }: { books: Book[]; onSelectBook: (book: Book) => void }) {
  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="card-title">Neu im Regal</h3>
          <p className="card-description">Aktuell hinzugefügte Titel</p>
        </div>
        {books.length > 0 && <span className="badge badge-slate">{books.length}</span>}
      </div>
      <div className="card-body pt-3">
        <div className="shelf">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {books.length > 0
              ? books.map((book) => (
                  <button key={book.id} type="button" className="featured-tile" onClick={() => onSelectBook(book)}>
                    <BookCover book={book} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs font-medium text-slate-900">{book.title}</p>
                      <p className="line-clamp-1 text-[11px] text-slate-500">
                        {book.authors || book.publisher || 'MedLib'}
                      </p>
                    </div>
                  </button>
                ))
              : Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="featured-tile">
                    <EmptyCover />
                    <div>
                      <div className="h-3 w-3/4 rounded bg-slate-200" />
                      <div className="mt-1 h-2 w-1/2 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
          </div>
          {books.length === 0 && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Noch keine Titel im Bestand – Uploads erscheinen hier automatisch.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function WorkspacePanel({
  workspace,
  onSelectBook,
}: {
  workspace: UserWorkspace | null
  onSelectBook: (book: Book) => void
}) {
  if (!workspace) {
    return (
      <section className="card">
        <div className="card-body">
          <p className="muted">Persönlicher Bereich wird geladen …</p>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <Star className="h-4 w-4 text-indigo-600" /> Mein Bereich
        </h3>
        <p className="card-description">Merkliste, Lesezeichen und Notizen</p>
      </div>
      <div className="card-body space-y-4 pt-3">
        <div>
          <p className="eyebrow mb-2">Merkliste</p>
          <div className="space-y-1.5">
            {workspace.saved_media.slice(0, 5).map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:border-slate-200 hover:bg-slate-50"
                onClick={() => onSelectBook(entry.book)}
              >
                <BookCover book={entry.book} compact />
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium text-slate-900">{entry.book.title}</span>
                  <span className="block text-[11px] text-slate-500">
                    {entry.book.media_type === 'journal' ? 'Zeitschrift' : 'Buch'}
                  </span>
                </span>
              </button>
            ))}
            {!workspace.saved_media.length && <p className="muted">Noch keine gemerkten Titel.</p>}
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="eyebrow mb-2">Bookmarks</p>
          <div className="space-y-1.5">
            {workspace.bookmarks.slice(0, 4).map((bookmark) => (
              <div key={bookmark.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                <p className="font-medium text-slate-900">{bookmark.book_title}</p>
                <p className="text-slate-500">
                  Seite {bookmark.page_number} · {bookmark.label || 'Lesezeichen'}
                </p>
              </div>
            ))}
            {!workspace.bookmarks.length && <p className="muted">Noch keine Bookmarks.</p>}
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="eyebrow mb-2">Notizen</p>
          <div className="space-y-1.5">
            {workspace.notes.slice(0, 4).map((note) => (
              <div key={note.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                <p className="font-medium text-slate-900">{note.book_title}</p>
                <p className="line-clamp-2 text-slate-500">{note.body}</p>
              </div>
            ))}
            {!workspace.notes.length && <p className="muted">Noch keine Notizen.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================== Admin panels ============================== */

function formatMetricValue(metric: DashboardMetric) {
  if (metric.key === 'storage_bytes') {
    const gigaBytes = metric.value / 1024 ** 3
    return gigaBytes >= 1 ? `${gigaBytes.toFixed(2)} GB` : `${(metric.value / 1024 ** 2).toFixed(1)} MB`
  }
  return new Intl.NumberFormat('de-DE').format(metric.value)
}

function jobStatusLabel(status: DashboardJob['status']) {
  return {
    pending: 'Ausstehend',
    running: 'Läuft',
    completed: 'Fertig',
    failed: 'Fehler',
  }[status]
}

function jobStatusBadge(status: DashboardJob['status']) {
  if (status === 'completed') return 'badge badge-emerald'
  if (status === 'failed') return 'badge badge-rose'
  if (status === 'running') return 'badge badge-amber'
  return 'badge badge-slate'
}

function DashboardPanel({
  dashboard,
  onRefresh,
}: {
  dashboard: DashboardOverview | null
  onRefresh: () => Promise<void>
}) {
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
    return (
      <section className="card">
        <div className="card-body">
          <p className="muted">Dashboard wird geladen …</p>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="card-title">Operations</h3>
          <p className="card-description">Kennzahlen und OCR-Pipeline</p>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={refresh}>
          {refreshing ? 'Aktualisiere …' : 'Aktualisieren'}
        </button>
      </div>
      <div className="card-body space-y-4 pt-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {dashboard.metrics.map((metric) => (
            <div key={metric.key} className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatMetricValue(metric)}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-slate-900">OCR-Jobs</h4>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(dashboard.job_status_counts).map(([status, count]) => (
              <div key={status} className="rounded-md bg-slate-50 px-2.5 py-2 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {jobStatusLabel(status as DashboardJob['status'])}
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900">{count}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {dashboard.recent_jobs.map((job) => (
              <div key={job.id} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{job.book_title}</p>
                    <p className="truncate text-slate-500">{job.message || 'OCR-Job ohne Zusatzmeldung'}</p>
                  </div>
                  <span className={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${job.status === 'failed' ? 'bg-rose-500' : 'bg-indigo-600'}`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>{job.progress}%</span>
                  <span>{new Date(job.updated_at).toLocaleString('de-DE')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-slate-900">Datenbank</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {dashboard.records_by_table.map((metric) => (
              <div key={metric.key} className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
                <p className="mt-0.5 text-base font-semibold text-slate-900">{formatMetricValue(metric)}</p>
              </div>
            ))}
          </div>
        </div>

        {dashboard.top_specialties.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-slate-900">Top-Fachgebiete</h4>
            </div>
            <div className="space-y-2">
              {dashboard.top_specialties.map((entry) => (
                <div key={entry.specialty}>
                  <div className="mb-0.5 flex items-center justify-between text-xs text-slate-600">
                    <span>{entry.specialty}</span>
                    <span className="text-slate-400">{entry.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, entry.count * 10)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dashboard.recent_imports.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-slate-900">Letzte Importe</h4>
            </div>
            <div className="space-y-2">
              {dashboard.recent_imports.map((item) => (
                <div key={item.book_id} className="rounded-md bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{item.title}</p>
                      <p className="truncate text-slate-500">{item.authors || item.source_filename}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <p>{item.page_count} Seiten</p>
                      <p>{item.specialty || 'ohne Fachgebiet'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ============================== Login ============================== */

function Login({
  onLogin,
  error,
  setError,
}: {
  onLogin: (user: User) => void
  error: string
  setError: (value: string) => void
}) {
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2">
        <div className="hidden lg:block">
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Library className="h-5 w-5" />
            </div>
            <span className="text-base font-semibold text-slate-900">MedLib</span>
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900">
            Die zentrale Fachbibliothek für deine Klinik.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            Lehrbücher, Journale und kuratierte Literatur an einem Ort. Mit Volltextsuche, persönlicher Merkliste
            und einfacher Verwaltung.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ['Bücher', 'Standardwerke & Lehrbücher'],
              ['Journals', 'Aktuelle Reihen & Ausgaben'],
              ['OCR-Suche', 'Volltext sekundenschnell'],
            ].map(([title, description]) => (
              <div key={title} className="card">
                <div className="card-body py-3">
                  <p className="text-sm font-medium text-slate-900">{title}</p>
                  <p className="mt-1 text-xs text-slate-500">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="login-card mx-auto w-full max-w-md">
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="eyebrow">Anmeldung</p>
              <h2 className="text-base font-semibold text-slate-900">Bei MedLib einloggen</h2>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">E-Mail</label>
              <input
                className="form-control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@klinik.de"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Passwort</label>
              <input
                className="form-control"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void submit()}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <button className="btn btn-primary mt-5 w-full" onClick={() => void submit()}>
            Einloggen <ChevronRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-center text-[11px] text-slate-500">
            Zugang nur für berechtigte Nutzer:innen der Klinikbibliothek.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ============================== Stats / Admin ============================== */

function Stats({ books }: { books: Book[] }) {
  const pageCount = books.reduce((sum, book) => sum + book.page_count, 0)
  const specialties = new Set(books.map((book) => book.specialty).filter(Boolean)).size
  return (
    <section className="card">
      <div className="card-body grid grid-cols-3 gap-2 py-3">
        {[
          ['Bücher', books.length],
          ['Seiten', pageCount],
          ['Fächer', specialties],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-md bg-slate-50 px-3 py-2 text-center">
            <p className="text-lg font-semibold text-slate-900">{value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function UploadPanel({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [inspection, setInspection] = useState<InspectResponse | null>(null)
  const [draft, setDraft] = useState<DraftMetadata>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function reset() {
    if (inspection) {
      void api.discardInspection(inspection.temp_id).catch(() => undefined)
    }
    setFile(null)
    setInspection(null)
    setDraft(emptyDraft())
    setError('')
    setInfo('')
  }

  async function inspect() {
    if (!file) return
    setError('')
    setInfo('')
    setInspecting(true)
    try {
      const result = await api.inspectBook(file)
      setInspection(result)
      if (result.best) {
        applyCandidate(result.best)
        setInfo(
          result.best.source === 'googlebooks'
            ? 'Treffer bei Google Books gefunden – bitte prüfen.'
            : 'Treffer bei OpenLibrary gefunden – bitte prüfen.',
        )
      } else {
        setInfo(
          result.detected_isbn
            ? `ISBN ${result.detected_isbn} erkannt, aber kein Online-Treffer. Bitte manuell ergänzen.`
            : 'Keine Daten gefunden – bitte manuell ergänzen.',
        )
      }
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : 'Cover-Analyse fehlgeschlagen')
    } finally {
      setInspecting(false)
    }
  }

  function applyCandidate(candidate: InspectMetadata) {
    setDraft((current) => ({
      ...current,
      title: candidate.title ?? current.title,
      subtitle: candidate.subtitle ?? current.subtitle,
      authors: candidate.authors ?? current.authors,
      publisher: candidate.publisher ?? current.publisher,
      isbn: candidate.isbn ?? current.isbn,
      year: candidate.year != null ? String(candidate.year) : current.year,
      description: candidate.description ?? current.description,
      language: candidate.language ?? current.language,
    }))
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inspection) return
    if (!draft.title.trim()) {
      setError('Titel ist erforderlich')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.commitInspectedBook({
        temp_id: inspection.temp_id,
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || null,
        authors: draft.authors.trim() || null,
        publisher: draft.publisher.trim() || null,
        isbn: draft.isbn.trim() || null,
        year: draft.year ? Number.parseInt(draft.year, 10) || null : null,
        edition: draft.edition.trim() || null,
        specialty: draft.specialty.trim() || null,
        media_type: draft.media_type,
        language: (draft.language || 'de').slice(0, 8),
        tags: draft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        description: draft.description.trim() || null,
      })
      await onUploaded()
      reset()
      setInfo('Buch wurde übernommen und OCR-Job gestartet.')
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <FileUp className="h-4 w-4 text-indigo-600" /> Neues Medium
        </h3>
        <p className="card-description">
          Cover wird per OCR gelesen und automatisch online (OpenLibrary, Google Books) recherchiert.
        </p>
      </div>
      <div className="card-body space-y-3 pt-3">
        {!inspection && (
          <div className="space-y-2.5">
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setError('')
                setInfo('')
              }}
              className="form-control bg-slate-50 text-xs"
            />
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!file || inspecting}
              onClick={() => void inspect()}
            >
              {inspecting ? 'Analysiere Cover & recherchiere …' : 'Cover analysieren'}
            </button>
            {file && !inspecting && (
              <p className="text-[11px] text-slate-500">
                Datei: <span className="font-medium text-slate-700">{file.name}</span>
              </p>
            )}
          </div>
        )}

        {inspection && (
          <form className="space-y-3" onSubmit={commit}>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{inspection.filename}</span>
                <button
                  type="button"
                  className="text-indigo-700 hover:text-indigo-800"
                  onClick={reset}
                >
                  Anderes PDF wählen
                </button>
              </div>
              {inspection.detected_isbn && (
                <p className="mt-1">
                  ISBN erkannt: <span className="font-medium text-slate-700">{inspection.detected_isbn}</span>
                </p>
              )}
              {inspection.suggested_query && !inspection.detected_isbn && (
                <p className="mt-1">
                  Suchbegriff:{' '}
                  <span className="font-medium text-slate-700">{inspection.suggested_query}</span>
                </p>
              )}
            </div>

            {inspection.candidates.length > 1 && (
              <div>
                <p className="eyebrow mb-1.5">Treffer</p>
                <div className="space-y-1.5">
                  {inspection.candidates.map((candidate, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => applyCandidate(candidate)}
                      className="flex w-full items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50/40"
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-1 font-medium text-slate-900">
                          {candidate.title || 'Ohne Titel'}
                        </span>
                        <span className="line-clamp-1 text-slate-500">
                          {[candidate.authors, candidate.publisher, candidate.year].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="badge badge-slate shrink-0">{candidate.source}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Titel *</span>
                <input
                  className="form-control"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  required
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Untertitel</span>
                <input
                  className="form-control"
                  value={draft.subtitle}
                  onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Autor:innen</span>
                <input
                  className="form-control"
                  value={draft.authors}
                  onChange={(event) => setDraft({ ...draft, authors: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Verlag</span>
                <input
                  className="form-control"
                  value={draft.publisher}
                  onChange={(event) => setDraft({ ...draft, publisher: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">ISBN</span>
                <input
                  className="form-control"
                  value={draft.isbn}
                  onChange={(event) => setDraft({ ...draft, isbn: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Jahr</span>
                <input
                  className="form-control"
                  type="number"
                  value={draft.year}
                  onChange={(event) => setDraft({ ...draft, year: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Auflage</span>
                <input
                  className="form-control"
                  value={draft.edition}
                  onChange={(event) => setDraft({ ...draft, edition: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Fachgebiet</span>
                <input
                  className="form-control"
                  value={draft.specialty}
                  onChange={(event) => setDraft({ ...draft, specialty: event.target.value })}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Typ</span>
                <select
                  className="form-control"
                  value={draft.media_type}
                  onChange={(event) =>
                    setDraft({ ...draft, media_type: event.target.value as 'book' | 'journal' })
                  }
                >
                  <option value="book">Buch</option>
                  <option value="journal">Zeitschrift</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Sprache</span>
                <input
                  className="form-control"
                  value={draft.language}
                  onChange={(event) => setDraft({ ...draft, language: event.target.value })}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Tags (kommagetrennt)</span>
                <input
                  className="form-control"
                  value={draft.tags}
                  onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                />
              </label>
            </div>

            {error && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                {error}
              </p>
            )}
            {info && !error && (
              <p className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
                {info}
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={reset} disabled={saving}>
                Abbrechen
              </button>
              <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                {saving ? 'Speichere …' : 'Übernehmen & OCR starten'}
              </button>
            </div>
          </form>
        )}

        {error && !inspection && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
            {error}
          </p>
        )}
        {info && !inspection && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            {info}
          </p>
        )}
      </div>
    </section>
  )
}

interface DraftMetadata {
  title: string
  subtitle: string
  authors: string
  publisher: string
  isbn: string
  year: string
  edition: string
  specialty: string
  media_type: 'book' | 'journal'
  language: string
  tags: string
  description: string
}

function emptyDraft(): DraftMetadata {
  return {
    title: '',
    subtitle: '',
    authors: '',
    publisher: '',
    isbn: '',
    year: '',
    edition: '',
    specialty: '',
    media_type: 'book',
    language: 'de',
    tags: '',
    description: '',
  }
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
    const [clinicRows, departmentRows, categoryRows, placementRows] = await Promise.all([
      api.clinics(),
      api.departments(),
      api.categories(),
      api.placements(),
    ])
    setClinics(clinicRows)
    setDepartments(departmentRows)
    setCategories(categoryRows)
    setPlacements(placementRows)
  }

  useEffect(() => {
    loadTaxonomy()
  }, [])

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
    await api.createPlacement({
      book_id: selectedBook,
      clinic_id: selectedClinic,
      department_id: selectedDepartment,
      category_id: selectedCategory || null,
    })
    setMessage('Medium wurde einsortiert')
    await Promise.all([loadTaxonomy(), onChanged()])
  }

  return (
    <section className="card">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-indigo-600" /> Struktur & Einsortierung
        </h3>
        <p className="card-description">Kliniken, Fachbereiche und Kategorien organisieren</p>
      </div>
      <div className="card-body space-y-3 pt-3">
        <div className="grid gap-2">
          <div className="flex gap-2">
            <input
              className="form-control flex-1"
              placeholder="Klinik"
              value={clinicName}
              onChange={(event) => setClinicName(event.target.value)}
            />
            <button className="btn btn-sm btn-secondary" onClick={addClinic}>
              +
            </button>
          </div>
          <select
            className="form-control"
            value={selectedClinic}
            onChange={(event) => {
              setSelectedClinic(event.target.value)
              setSelectedDepartment('')
              setSelectedCategory('')
            }}
          >
            <option value="">Klinik wählen</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="form-control flex-1"
              placeholder="Fachbereich"
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
            />
            <button className="btn btn-sm btn-secondary" onClick={addDepartment}>
              +
            </button>
          </div>
          <select
            className="form-control"
            value={selectedDepartment}
            onChange={(event) => {
              setSelectedDepartment(event.target.value)
              setSelectedCategory('')
            }}
          >
            <option value="">Fachbereich wählen</option>
            {filteredDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="form-control flex-1"
              placeholder="Kategorie"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <button className="btn btn-sm btn-secondary" onClick={addCategory}>
              +
            </button>
          </div>
          <select
            className="form-control"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
          >
            <option value="">Kategorie optional</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
            <Building2 className="h-3.5 w-3.5" /> Medium einsortieren
          </p>
          <select
            className="form-control mb-2"
            value={selectedBook}
            onChange={(event) => setSelectedBook(event.target.value)}
          >
            <option value="">Buch / Zeitschrift wählen</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
          <button className="btn btn-primary w-full" onClick={assignMedia}>
            Zuordnen
          </button>
          {message && (
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
              {message}
            </p>
          )}
        </div>

        {placements.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-auto border-t border-slate-100 pt-3">
            {placements.slice(0, 8).map((placement) => (
              <p key={placement.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                {placement.clinic_name} / {placement.department_name}
                {placement.category_name ? ` / ${placement.category_name}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function AccountPanel({
  currentUser,
  onUserChanged,
}: {
  currentUser: User
  onUserChanged: (user: User) => void
}) {
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
    <section className="card">
      <div className="card-header">
        <h3 className="card-title">Mein Zugang</h3>
        <p className="card-description">{currentUser.email}</p>
      </div>
      <form className="card-body space-y-2.5 pt-3" onSubmit={submit}>
        <input
          className="form-control"
          type="password"
          placeholder="Aktuelles Passwort"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
        <input
          className="form-control"
          type="password"
          placeholder="Neues Passwort"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          minLength={10}
          required
        />
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>
        )}
        {message && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
            {message}
          </p>
        )}
        <button disabled={busy} className="btn btn-secondary w-full">
          {busy ? 'Aktualisiere …' : 'Passwort ändern'}
        </button>
      </form>
    </section>
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
    role: 'reader' as Role,
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
    setUsers((currentUsers) => currentUsers.map((entry) => (entry.id === updatedUser.id ? updatedUser : entry)))
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

  const creatableRoles: Role[] =
    currentUser.role === 'admin' ? ['admin', 'librarian', 'clinician', 'reader'] : ['clinician', 'reader']

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
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="card-title flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" /> Benutzerverwaltung
          </h3>
          <p className="card-description">Anlegen, Rollen, Passwörter</p>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={loadUsers} type="button">
          Neu laden
        </button>
      </div>
      <div className="card-body space-y-4 pt-3">
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={submit}>
          <input
            className="form-control"
            placeholder="Vollständiger Name"
            value={form.full_name}
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            required
          />
          <input
            className="form-control"
            type="email"
            placeholder="E-Mail"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
          <input
            className="form-control"
            type="password"
            placeholder="Initiales Passwort"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            minLength={10}
            required
          />
          <select
            className="form-control"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
          >
            {creatableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 sm:col-span-2">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 sm:col-span-2">
              {success}
            </p>
          )}
          <button disabled={saving} className="btn btn-primary sm:col-span-2">
            {saving ? 'Lege Benutzer an …' : 'Benutzer anlegen'}
          </button>
        </form>

        <div className="space-y-1.5">
          {loading ? (
            <p className="muted">Benutzer werden geladen …</p>
          ) : (
            users.map((user) => (
              <div key={user.id} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{user.full_name}</p>
                    <p className="truncate text-slate-500">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={user.is_active ? 'badge badge-emerald' : 'badge badge-rose'}>
                      {user.is_active ? 'aktiv' : 'inaktiv'}
                    </span>
                    <span className="badge badge-indigo">{user.role}</span>
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  <select
                    className="form-control"
                    value={roleDrafts[user.id] ?? user.role}
                    onChange={(event) =>
                      setRoleDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [user.id]: event.target.value as Role,
                      }))
                    }
                    disabled={currentUser.id === user.id || !canManageUser(user)}
                  >
                    {manageableRoles(user).map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => updateRole(user)}
                    type="button"
                    disabled={currentUser.id === user.id || !canManageUser(user)}
                  >
                    Rolle setzen
                  </button>
                  <input
                    className="form-control"
                    type="password"
                    placeholder="Neues Passwort"
                    value={passwordDrafts[user.id] ?? ''}
                    onChange={(event) =>
                      setPasswordDrafts((currentDrafts) => ({ ...currentDrafts, [user.id]: event.target.value }))
                    }
                    disabled={!canManageUser(user)}
                  />
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => resetPassword(user)}
                    type="button"
                    disabled={!canManageUser(user)}
                  >
                    Passwort setzen
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => toggleUserStatus(user)}
                    type="button"
                    disabled={(currentUser.id === user.id && user.is_active) || !canManageUser(user)}
                  >
                    {user.is_active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => deleteUser(user)}
                    type="button"
                    disabled={currentUser.id === user.id || !canManageUser(user)}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

/* ============================== Helpers / cover / shelf ============================== */

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character,
  )
}

function highlightTerm(value: string, query: string) {
  const escaped = escapeHtml(value)
  if (!query.trim()) return escaped
  return escaped.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>')
}

function shortTitle(title: string, words = 6) {
  return title.split(/\s+/).slice(0, words).join(' ')
}

const COVER_THEMES = [
  'linear-gradient(155deg, #312e81 0%, #4f46e5 60%, #818cf8 100%)',
  'linear-gradient(155deg, #134e4a 0%, #0f766e 60%, #5eead4 100%)',
  'linear-gradient(155deg, #7c2d12 0%, #c2410c 60%, #fdba74 100%)',
  'linear-gradient(155deg, #1e3a8a 0%, #1d4ed8 60%, #60a5fa 100%)',
  'linear-gradient(155deg, #581c87 0%, #7e22ce 60%, #d8b4fe 100%)',
  'linear-gradient(155deg, #14532d 0%, #15803d 60%, #86efac 100%)',
]

function coverGradient(book: Book) {
  const signature = `${book.title}${book.specialty ?? ''}`
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return COVER_THEMES[signature % COVER_THEMES.length]
}

function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  const dimensions = compact ? 'h-12 w-8' : 'h-24 w-16'
  const [imageFailed, setImageFailed] = useState(false)

  if (!imageFailed) {
    return (
      <img
        src={api.bookCoverUrl(book)}
        alt={`Cover von ${book.title}`}
        className={`cover ${dimensions} shrink-0 object-cover`}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    )
  }

  const titleSize = compact ? 'text-[8px]' : 'text-[10px]'
  return (
    <div
      className={`cover ${dimensions} flex shrink-0 flex-col justify-between p-1.5`}
      style={{ background: coverGradient(book) }}
    >
      <p className={`${titleSize} line-clamp-3 font-semibold leading-tight`}>{shortTitle(book.title, compact ? 4 : 7)}</p>
      {!compact && (
        <p className="line-clamp-1 text-[8px] font-medium uppercase tracking-wide text-white/80">
          {book.specialty || (book.media_type === 'journal' ? 'Journal' : 'Buch')}
        </p>
      )}
    </div>
  )
}

function EmptyCover() {
  return <div className="cover-empty h-24 w-16" />
}

function BookShelf({
  books,
  hits,
  query,
  onSelect,
  onSave,
}: {
  books: Book[]
  hits: SearchHit[]
  query: string
  onSelect: (book: Book) => void
  onSave: (book: Book) => Promise<void>
}) {
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

  const letters = useMemo(
    () => ['ALLE', ...new Set(books.map((book) => book.title.trim().charAt(0).toUpperCase()).filter(Boolean)).values()],
    [books],
  )

  return (
    <section className="card">
      <div className="card-header">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="card-title">Bestand</h3>
            <p className="card-description">Filtern, sortieren und direkt öffnen</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md bg-slate-100 p-0.5">
              {[
                ['all', 'Alle'],
                ['journal', 'Zeitschriften'],
                ['book', 'Bücher'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`tab ${mediaFilter === value ? 'tab-active' : ''}`}
                  onClick={() => setMediaFilter(value as 'all' | 'book' | 'journal')}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="form-control h-8 w-44 text-xs"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as 'title' | 'year' | 'specialty' | 'author')}
            >
              <option value="title">Sortieren: Titel</option>
              <option value="year">Sortieren: Jahr</option>
              <option value="specialty">Sortieren: Fachgebiet</option>
              <option value="author">Sortieren: Autor:in</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card-body space-y-3 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {letters.map((letter) => (
            <button
              key={letter}
              className={`alphabet-chip ${letterFilter === letter ? 'alphabet-chip-active' : ''}`}
              onClick={() => setLetterFilter(letter)}
              type="button"
            >
              {letter}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{sortedBooks.length} Titel</span>
          {query.trim() && <span className="badge badge-slate">Suche: {query}</span>}
        </div>

        {sortedBooks.length > 0 ? (
          <div className="space-y-1.5">
            {sortedBooks.map((book) => {
              const hit = hitsByBook.get(book.id)
              return (
                <article key={book.id} className="book-row group">
                  <button
                    type="button"
                    className="flex items-center justify-center"
                    onClick={() => onSelect(book)}
                    aria-label={`${book.title} öffnen`}
                  >
                    <BookCover book={book} compact />
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      <span>{book.media_type === 'journal' ? 'Zeitschrift' : 'Buch'}</span>
                      <span className="text-slate-300">•</span>
                      <span>{book.specialty ?? 'Medizin'}</span>
                      {book.year && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span>{book.year}</span>
                        </>
                      )}
                    </div>
                    <button className="mt-0.5 text-left" onClick={() => onSelect(book)} type="button">
                      <h4 className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
                        {book.title}
                      </h4>
                    </button>
                    <p className="line-clamp-1 text-xs text-slate-500">
                      {book.authors ?? book.publisher ?? 'Unbekannt'} · {book.page_count} Seiten
                    </p>
                    {hit?.snippet && (
                      <p
                        className="snippet mt-1.5 line-clamp-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] leading-5 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: highlightTerm(hit.snippet, query) }}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="btn btn-sm btn-primary" onClick={() => onSelect(book)} type="button">
                      Lesen
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => void onSave(book)} type="button">
                      Merken
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyShelf />
        )}
      </div>
    </section>
  )
}

function EmptyShelf() {
  return (
    <div className="shelf">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 16 }).map((_, index) => (
          <EmptyCover key={index} />
        ))}
      </div>
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-slate-900">Das Regal ist noch leer</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Sobald Medien hochgeladen wurden, erscheinen sie hier mit Cover und Suche.
        </p>
      </div>
    </div>
  )
}

/* ============================== Reader ============================== */

function Reader({
  book,
  query,
  onBack,
  onSave,
}: {
  book: Book
  query: string
  onBack: () => void
  onSave: (book: Book) => Promise<void>
}) {
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<PageText | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [pdfError, setPdfError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pendingHighlight, setPendingHighlight] = useState<{
    text: string
    locator: {
      page_number: number
      rects: Array<{ left: number; top: number; width: number; height: number }>
    }
  } | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    let active = true
    const sourceUrl = api.bookViewerUrl(book)
    const loadingTask = getDocument(sourceUrl)

    setPdfLoading(true)
    setPdfError('')
    setPdfDocument(null)
    setZoom(1)
    setPendingHighlight(null)

    loadingTask.promise
      .then((document) => {
        if (!active) {
          void document.destroy()
          return
        }
        setPdfDocument(document)
        setPageNumber((current) => Math.min(Math.max(current, 1), document.numPages))
      })
      .catch((error: unknown) => {
        if (!active) return
        setPdfError(error instanceof Error ? error.message : 'PDF konnte nicht geladen werden')
      })
      .finally(() => {
        if (active) setPdfLoading(false)
      })

    return () => {
      active = false
      void loadingTask.destroy()
    }
  }, [book])

  useEffect(() => {
    api
      .page(book.id, pageNumber)
      .then(setPage)
      .catch(() =>
        setPage({
          page_number: pageNumber,
          text: 'Für diese Seite liegt noch kein OCR-Text vor. Der OCR-Job läuft ggf. noch.',
        }),
      )
    api.notes(book.id).then(setNotes)
    api.bookmarks(book.id).then(setBookmarks)
    api.highlights(book.id).then(setHighlights)
  }, [book.id, pageNumber])

  const markedText = useMemo(() => {
    if (!page?.text || !query.trim()) return escapeHtml(page?.text ?? '')
    return highlightTerm(page.text, query)
  }, [page?.text, query])

  const pageCount = pdfDocument?.numPages || book.page_count || 0
  const currentPageHighlights = useMemo(
    () =>
      highlights.filter(
        (highlight) =>
          highlight.page_number === pageNumber &&
          Array.isArray(highlight.locator?.rects) &&
          (highlight.locator?.rects?.length ?? 0) > 0,
      ),
    [highlights, pageNumber],
  )

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
    if (!pendingHighlight) return
    const highlight = await api.createHighlightWithLocator(
      book.id,
      pageNumber,
      pendingHighlight.text,
      pendingHighlight.locator,
    )
    setHighlights([highlight, ...highlights])
    setPendingHighlight(null)
  }

  return (
    <section className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button className="text-xs font-medium text-indigo-700 hover:text-indigo-800" onClick={onBack} type="button">
            ← Zur Bibliothek
          </button>
          <h3 className="mt-1 truncate text-base font-semibold text-slate-900">{book.title}</h3>
          <p className="truncate text-xs text-slate-500">
            {[book.authors, book.publisher, book.year].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button className="btn btn-sm btn-secondary" onClick={() => onSave(book)} type="button">
            <Star className="h-3.5 w-3.5" /> Merken
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => api.downloadBook(book)} type="button">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="min-h-[36rem] border-r border-slate-100 bg-slate-50 p-4 lg:p-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <button
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(pageNumber - 1)}
                className="btn btn-sm btn-secondary"
              >
                Zurück
              </button>
              <span className="font-medium text-slate-700">
                Seite {pageNumber} / {pageCount || '?'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.1).toFixed(2))))}
                  disabled={zoom <= 0.75}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-12 text-center font-medium text-slate-700">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}
                  disabled={zoom >= 2.5}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                disabled={pageCount > 0 && pageNumber >= pageCount}
                onClick={() => setPageNumber(pageNumber + 1)}
                className="btn btn-sm btn-secondary"
              >
                Weiter
              </button>
            </div>
            <div className="pdf-shell">
              {pdfLoading && <div className="pdf-status">PDF wird geladen …</div>}
              {pdfError && !pdfLoading && <div className="pdf-status pdf-status-error">{pdfError}</div>}
              {pdfDocument && !pdfError && (
                <PdfCanvasViewer
                  pdfDocument={pdfDocument}
                  pageNumber={pageNumber}
                  zoom={zoom}
                  highlights={currentPageHighlights}
                  onTextSelect={(selection) => setPendingHighlight(selection)}
                />
              )}
            </div>
          </div>
        </article>
        <aside className="space-y-4 p-4">
          <section>
            <h4 className="mb-1.5 text-xs font-semibold text-slate-900">OCR-Text der aktuellen Seite</h4>
            <p className="mb-2 text-[11px] text-slate-500">Suche und Volltext basieren auf OCR. Markierungen kommen jetzt aus der PDF-Textauswahl links.</p>
            <div
              className="reader-text max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800"
              dangerouslySetInnerHTML={{ __html: markedText }}
            />
          </section>
          <button className="btn btn-primary w-full" onClick={saveBookmark} type="button">
            Lesezeichen setzen
          </button>
          <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <h4 className="mb-1.5 text-xs font-semibold text-slate-900">PDF-Markierung</h4>
            {pendingHighlight ? (
              <>
                <p className="line-clamp-3 text-xs leading-5 text-slate-700">{pendingHighlight.text}</p>
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-sm btn-primary" onClick={saveHighlight} type="button">
                    Markierung speichern
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setPendingHighlight(null)} type="button">
                    Verwerfen
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600">Text direkt im PDF markieren, dann hier speichern.</p>
            )}
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold text-slate-900">Notiz zur Seite</h4>
            <textarea
              className="w-full"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
            />
            <button className="btn btn-sm btn-secondary mt-1.5" onClick={saveNote} type="button">
              Speichern
            </button>
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold text-slate-900">Lesezeichen</h4>
            {bookmarks.map((bookmark) => (
              <button
                key={bookmark.id}
                className="mb-1 block w-full rounded-md bg-slate-50 px-2.5 py-1.5 text-left text-xs hover:bg-slate-100"
                onClick={() => setPageNumber(bookmark.page_number)}
                type="button"
              >
                {bookmark.label}
              </button>
            ))}
            {!bookmarks.length && <p className="muted">Noch keine Lesezeichen.</p>}
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold text-slate-900">Markierungen</h4>
            {highlights.map((highlight) => (
              <button
                key={highlight.id}
                className="mb-1 block w-full rounded-md bg-amber-50 px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-amber-100"
                onClick={() => setPageNumber(highlight.page_number)}
                type="button"
              >
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Seite {highlight.page_number}
                </span>
                {highlight.selected_text}
              </button>
            ))}
            {!highlights.length && <p className="muted">Noch keine Markierungen.</p>}
          </section>
          <section>
            <h4 className="mb-1.5 text-xs font-semibold text-slate-900">Notizen</h4>
            {notes.map((note) => (
              <p key={note.id} className="mb-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                <span className="font-medium text-slate-900">S. {note.page_number}: </span>
                <span className="text-slate-600">{note.body}</span>
              </p>
            ))}
            {!notes.length && <p className="muted">Noch keine Notizen.</p>}
          </section>
        </aside>
      </div>
    </section>
  )
}

function PdfCanvasViewer({
  pdfDocument,
  pageNumber,
  zoom,
  highlights,
  onTextSelect,
}: {
  pdfDocument: PDFDocumentProxy
  pageNumber: number
  zoom: number
  highlights: Highlight[]
  onTextSelect: (selection: {
    text: string
    locator: {
      page_number: number
      rects: Array<{ left: number; top: number; width: number; height: number }>
    }
  } | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const updateWidth = () => setContainerWidth(wrapper.clientWidth)
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(wrapper)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !containerWidth) return

    let active = true
    let cancelRender: (() => void) | null = null
    let cancelTextLayer = false

    setRendering(true)
    onTextSelect(null)

    void pdfDocument.getPage(pageNumber).then((page) => {
      if (!active) return

      const baseViewport = page.getViewport({ scale: 1 })
      const fitScale = Math.max(0.5, ((containerWidth - 32) / baseViewport.width) * zoom)
      const viewport = page.getViewport({ scale: fitScale })
      const pixelRatio = window.devicePixelRatio || 1
      const context = canvas.getContext('2d')

      if (!context) {
        setRendering(false)
        return
      }

      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      if (pageRef.current) {
        pageRef.current.style.width = `${Math.floor(viewport.width)}px`
        pageRef.current.style.height = `${Math.floor(viewport.height)}px`
      }

      if (textLayerRef.current) {
        textLayerRef.current.replaceChildren()
        textLayerRef.current.style.width = `${Math.floor(viewport.width)}px`
        textLayerRef.current.style.height = `${Math.floor(viewport.height)}px`
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      const task = page.render({ canvas, canvasContext: context, viewport })
      cancelRender = () => task.cancel()
      void page
        .getTextContent({ includeMarkedContent: true, disableNormalization: true })
        .then((textContent) => {
          if (cancelTextLayer || !textLayerRef.current) return
          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport,
          })
          return textLayer.render()
        })
      void task.promise.finally(() => {
        if (active) setRendering(false)
      })
    })

    return () => {
      active = false
      cancelTextLayer = true
      cancelRender?.()
    }
  }, [containerWidth, onTextSelect, pageNumber, pdfDocument, zoom])

  function handleMouseUp() {
    const selection = window.getSelection()
    const layer = textLayerRef.current
    if (!selection || !layer || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }

    const range = selection.getRangeAt(0)
    if (!layer.contains(range.commonAncestorContainer)) {
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      selection.removeAllRanges()
      return
    }

    const layerRect = layer.getBoundingClientRect()
    const rects = Array.from(range.getClientRects())
      .map((rect) => ({
        left: (rect.left - layerRect.left) / layerRect.width,
        top: (rect.top - layerRect.top) / layerRect.height,
        width: rect.width / layerRect.width,
        height: rect.height / layerRect.height,
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0)

    if (!rects.length) {
      selection.removeAllRanges()
      return
    }

    onTextSelect({
      text,
      locator: {
        page_number: pageNumber,
        rects,
      },
    })
    selection.removeAllRanges()
  }

  return (
    <div ref={wrapperRef} className="pdf-canvas-wrap">
      {rendering && <div className="pdf-rendering">Seite wird gerendert …</div>}
      <div ref={pageRef} className="pdf-page">
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textLayerRef} className="pdf-textLayer" onMouseUp={handleMouseUp} />
        <div className="pdf-highlightLayer">
          {highlights.flatMap((highlight) =>
            (highlight.locator?.rects ?? []).map((rect, index) => (
              <div
                key={`${highlight.id}-${index}`}
                className="pdf-highlightBox"
                style={{
                  left: `${rect.left * 100}%`,
                  top: `${rect.top * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
                title={highlight.selected_text}
              />
            )),
          )}
        </div>
      </div>
    </div>
  )
}

export default App
