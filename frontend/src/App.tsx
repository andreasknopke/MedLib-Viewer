import { useEffect, useMemo, useRef, useState, Fragment, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Activity,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Database,
  Download,
  FileUp,
  FolderTree,
  Gauge,
  LayoutDashboard,
  Library,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  Rows2,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { api, type SearchScope } from './api'
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

GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), {
  type: 'module',
})

type ViewKey = 'dashboard' | 'library' | 'search' | 'reader' | 'admin' | 'users'

interface TaxonomyData {
  clinics: Clinic[]
  departments: Department[]
  categories: Category[]
  placements: Placement[]
}

const EMPTY_TAXONOMY: TaxonomyData = { clinics: [], departments: [], categories: [], placements: [] }

interface NavEntry {
  key: ViewKey
  label: string
  description: string
  icon: typeof LayoutDashboard
  requires?: Role[]
}

const NAV_ITEMS: NavEntry[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Merkliste, Highlights & Notizen', icon: LayoutDashboard },
  { key: 'library', label: 'Bibliothek', description: 'Bestand durchsuchen & lesen', icon: BookOpen },
  { key: 'search', label: 'Suche', description: 'Volltext mit Wildcards', icon: Search },
  { key: 'admin', label: 'Verwaltung', description: 'Uploads, OCR, Kennzahlen', icon: Settings, requires: ['admin', 'librarian'] },
  { key: 'users', label: 'Benutzer', description: 'Mein Zugang & Verwaltung', icon: Users },
]

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<ViewKey>('library')
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [scope, setScope] = useState<SearchScope>({})
  const [taxonomy, setTaxonomy] = useState<TaxonomyData>(EMPTY_TAXONOMY)
  const [dashboard, setDashboard] = useState<DashboardOverview | null>(null)
  const [workspace, setWorkspace] = useState<UserWorkspace | null>(null)
  const [error, setError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  async function hydrateAuthenticatedApp(nextUser: User) {
    setUser(nextUser)
    await Promise.all([loadBooks(), loadWorkspace(), loadTaxonomy(), loadDashboard()])
  }

  useEffect(() => {
    api
      .me()
      .then(hydrateAuthenticatedApp)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [view, selectedBook?.id])

  async function loadBooks(currentScope: SearchScope = scope) {
    setBooks(await api.books('', currentScope))
  }

  async function loadDashboard() {
    try {
      setDashboard(await api.dashboardOverview())
    } catch {
      setDashboard(null)
    }
  }

  async function loadWorkspace() {
    setWorkspace(await api.workspace())
  }

  async function loadTaxonomy() {
    try {
      const [clinics, departments, categories, placements] = await Promise.all([
        api.clinics(),
        api.departments(),
        api.categories(),
        api.placements(),
      ])
      setTaxonomy({ clinics, departments, categories, placements })
    } catch {
      setTaxonomy(EMPTY_TAXONOMY)
    }
  }

  async function saveToWorkspace(book: Book) {
    await api.saveMedia(book.id)
    await loadWorkspace()
  }

  async function runSearch(query: string, nextScope: SearchScope = scope, gotoResults = true) {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchHits([])
      await loadBooks(nextScope)
      if (gotoResults) setView('library')
      return
    }
    setSearching(true)
    try {
      const [hits, matchingBooks] = await Promise.all([
        api.search(query, nextScope),
        api.books(query, nextScope),
      ])
      setSearchHits(hits)
      setBooks(matchingBooks)
      if (gotoResults) {
        setSelectedBook(null)
        setView('search')
      }
    } finally {
      setSearching(false)
    }
  }

  async function changeScope(nextScope: SearchScope) {
    setScope(nextScope)
    if (searchQuery.trim()) {
      await runSearch(searchQuery, nextScope, false)
    } else {
      await loadBooks(nextScope)
    }
  }

  const [readerInitialPage, setReaderInitialPage] = useState<number | undefined>(undefined)
  const [readerInitialTerm, setReaderInitialTerm] = useState<string>('')

  function openBook(book: Book, pageNumber?: number, highlightTerm?: string) {
    setSelectedBook(book)
    setReaderInitialPage(pageNumber)
    setReaderInitialTerm(highlightTerm ?? '')
    setView('reader')
  }

  if (!user) {
    return <Login onLogin={hydrateAuthenticatedApp} error={error} setError={setError} />
  }

  const canAdmin = user.role === 'admin' || user.role === 'librarian'
  const availableNav = NAV_ITEMS.filter((entry) => !entry.requires || entry.requires.includes(user.role))
  const currentNav = availableNav.find((entry) => entry.key === view) ?? availableNav[0]

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <Sidebar
        user={user}
        view={view}
        items={availableNav}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onNavigate={(key) => {
          setView(key)
          setSelectedBook(null)
        }}
        onLogout={() => {
          api.logout()
          setUser(null)
        }}
      />

      <div className="app-main">
        <TopBar
          title={currentNav?.label ?? ''}
          subtitle={currentNav?.description ?? ''}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearch={(q) => void runSearch(q)}
          scope={scope}
          taxonomy={taxonomy}
          onScopeChange={(next) => void changeScope(next)}
          searching={searching}
          onOpenNav={() => setMobileNavOpen(true)}
        />

        <main className="app-content">
          <div className="mx-auto w-full max-w-screen-2xl px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
            {view === 'dashboard' && (
              <DashboardView
                workspace={workspace}
                onOpenBook={openBook}
                onChanged={loadWorkspace}
              />
            )}

            {view === 'library' && (
              <LibraryView
                books={books}
                taxonomy={taxonomy}
                scope={scope}
                onScopeChange={(next) => void changeScope(next)}
                onOpenBook={openBook}
                onSaveBook={saveToWorkspace}
                workspace={workspace}
              />
            )}

            {view === 'search' && (
              <SearchView
                query={searchQuery}
                searching={searching}
                hits={searchHits}
                books={books}
                scope={scope}
                taxonomy={taxonomy}
                onScopeChange={(next) => void changeScope(next)}
                onOpenBook={openBook}
                onOpenHit={(book, pageNumber) => openBook(book, pageNumber, searchQuery)}
                onClear={() => {
                  setSearchQuery('')
                  setSearchHits([])
                  void loadBooks()
                  setView('library')
                }}
              />
            )}

            {view === 'reader' && selectedBook && (
              <Reader
                book={selectedBook}
                query={searchQuery}
                initialPage={readerInitialPage}
                initialTerm={readerInitialTerm}
                onBack={() => {
                  setSelectedBook(null)
                  setReaderInitialPage(undefined)
                  setReaderInitialTerm('')
                  setView(searchHits.length > 0 ? 'search' : 'library')
                }}
                onSave={saveToWorkspace}
              />
            )}

            {view === 'admin' && canAdmin && (
              <AdminView
                dashboard={dashboard}
                onRefreshDashboard={loadDashboard}
                onChanged={async () => {
                  await Promise.all([loadBooks(), loadDashboard(), loadTaxonomy()])
                }}
              />
            )}

            {view === 'users' && (
              <UsersView user={user} onUserChanged={setUser} canAdmin={canAdmin} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/* ============================== Layout shell ============================== */

function Sidebar({
  user,
  view,
  items,
  mobileOpen,
  onClose,
  onNavigate,
  onLogout,
}: {
  user: User
  view: ViewKey
  items: NavEntry[]
  mobileOpen: boolean
  onClose: () => void
  onNavigate: (key: ViewKey) => void
  onLogout: () => void
}) {
  return (
    <aside
      className={`app-sidebar ${mobileOpen ? 'app-sidebar-open' : ''}`}
      aria-label="Hauptnavigation"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
            <Library className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">MedLib</p>
            <p className="text-[11px] text-slate-500">Klinikbibliothek</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          onClick={onClose}
          aria-label="Menü schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
        {items.map((entry) => {
          const Icon = entry.icon
          const active = view === entry.key
          return (
            <button
              key={entry.key}
              type="button"
              className={`nav-item ${active ? 'nav-item-active' : ''}`}
              onClick={() => onNavigate(entry.key)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{entry.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 rounded-md bg-slate-50 px-3 py-2">
          <p className="truncate text-sm font-medium text-slate-900">{user.full_name}</p>
          <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          <span className="badge badge-indigo mt-1.5">{user.role}</span>
        </div>
        <button type="button" className="nav-item" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> Abmelden
        </button>
      </div>
    </aside>
  )
}

function TopBar({
  title,
  subtitle,
  searchQuery,
  setSearchQuery,
  onSearch,
  scope,
  taxonomy,
  onScopeChange,
  searching,
  onOpenNav,
}: {
  title: string
  subtitle: string
  searchQuery: string
  setSearchQuery: (v: string) => void
  onSearch: (v: string) => void
  scope: SearchScope
  taxonomy: TaxonomyData
  onScopeChange: (next: SearchScope) => void
  searching: boolean
  onOpenNav: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const scopeLabel = useMemo(() => describeScope(scope, taxonomy), [scope, taxonomy])

  return (
    <header className="app-topbar">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 lg:px-8">
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          onClick={onOpenNav}
          aria-label="Menü öffnen"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="hidden min-w-0 lg:block">
          <h1 className="truncate text-sm font-semibold text-slate-900">{title}</h1>
          <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
        </div>

        <form
          className="search-bar"
          onSubmit={(event) => {
            event.preventDefault()
            onSearch(searchQuery)
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="search-bar-input"
            placeholder='Volltextsuche – z. B. "meningi*" -kinder OR neugeborenes'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-24 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"
              onClick={() => {
                setSearchQuery('')
                onSearch('')
              }}
              aria-label="Suche zurücksetzen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="submit" className="btn btn-sm btn-primary absolute right-1.5 top-1/2 -translate-y-1/2">
            {searching ? '…' : 'Suchen'}
          </button>
        </form>

        <button
          type="button"
          className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-slate-300 sm:inline-flex"
          onClick={() => setExpanded((value) => !value)}
        >
          <FolderTree className="h-3.5 w-3.5 text-indigo-600" />
          <span className="font-medium">{scopeLabel}</span>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-end gap-2 px-3 py-3 sm:px-5 lg:px-8">
            <ScopePicker scope={scope} taxonomy={taxonomy} onChange={onScopeChange} />
            <p className="ml-auto text-[11px] text-slate-500">
              Wildcard: <code className="font-mono">begriff*</code> · Ausschluss: <code className="font-mono">-wort</code> · Oder: <code className="font-mono">begriff OR andere</code>
            </p>
          </div>
        </div>
      )}
    </header>
  )
}

function ScopePicker({
  scope,
  taxonomy,
  onChange,
}: {
  scope: SearchScope
  taxonomy: TaxonomyData
  onChange: (next: SearchScope) => void
}) {
  const filteredDepartments = taxonomy.departments.filter(
    (department) => !scope.clinicId || department.clinic_id === scope.clinicId,
  )
  const filteredCategories = taxonomy.categories.filter(
    (category) => !scope.departmentId || category.department_id === scope.departmentId,
  )
  return (
    <div className="grid w-full gap-2 sm:grid-cols-3">
      <label className="block">
        <span className="eyebrow mb-1 block">Klinik</span>
        <select
          className="form-control"
          value={scope.clinicId ?? ''}
          onChange={(event) =>
            onChange({ clinicId: event.target.value || undefined, departmentId: undefined, categoryId: undefined })
          }
        >
          <option value="">Alle Kliniken</option>
          {taxonomy.clinics.map((clinic) => (
            <option key={clinic.id} value={clinic.id}>
              {clinic.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1 block">Fachbereich</span>
        <select
          className="form-control"
          value={scope.departmentId ?? ''}
          onChange={(event) =>
            onChange({ ...scope, departmentId: event.target.value || undefined, categoryId: undefined })
          }
          disabled={!filteredDepartments.length}
        >
          <option value="">Alle Fachbereiche</option>
          {filteredDepartments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1 block">Kategorie</span>
        <select
          className="form-control"
          value={scope.categoryId ?? ''}
          onChange={(event) => onChange({ ...scope, categoryId: event.target.value || undefined })}
          disabled={!filteredCategories.length}
        >
          <option value="">Alle Kategorien</option>
          {filteredCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function describeScope(scope: SearchScope, taxonomy: TaxonomyData) {
  const parts: string[] = []
  if (scope.clinicId) {
    const clinic = taxonomy.clinics.find((c) => c.id === scope.clinicId)
    if (clinic) parts.push(clinic.name)
  }
  if (scope.departmentId) {
    const department = taxonomy.departments.find((d) => d.id === scope.departmentId)
    if (department) parts.push(department.name)
  }
  if (scope.categoryId) {
    const category = taxonomy.categories.find((c) => c.id === scope.categoryId)
    if (category) parts.push(category.name)
  }
  return parts.length ? parts.join(' / ') : 'Gesamter Bestand'
}

/* ============================== Views ============================== */

/* DashboardView removed – Kennzahlen & OCR-Pipeline leben in AdminView, Mein Zugang in UsersView. */

function WorkspaceSection({
  workspace,
  onOpenBook,
}: {
  workspace: UserWorkspace | null
  onOpenBook: (book: Book) => void
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <Star className="h-4 w-4 text-indigo-600" /> Meine Sammlung
        </h3>
        <p className="card-description">Merkliste, Lesezeichen und Notizen</p>
      </div>
      <div className="card-body grid gap-4 pt-3 md:grid-cols-3">
        <div>
          <p className="eyebrow mb-2">Merkliste</p>
          {workspace?.saved_media.length ? (
            <div className="space-y-1.5">
              {workspace.saved_media.slice(0, 6).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:border-slate-200 hover:bg-slate-50"
                  onClick={() => onOpenBook(entry.book)}
                >
                  <BookCover book={entry.book} size="xs" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-medium text-slate-900">{entry.book.title}</span>
                    <span className="block text-[11px] text-slate-500">
                      {entry.book.media_type === 'journal' ? 'Zeitschrift' : 'Buch'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Noch keine gemerkten Titel.</p>
          )}
        </div>
        <div>
          <p className="eyebrow mb-2">Bookmarks</p>
          {workspace?.bookmarks.length ? (
            <div className="space-y-1.5">
              {workspace.bookmarks.slice(0, 6).map((bookmark) => (
                <div key={bookmark.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                  <p className="font-medium text-slate-900">{bookmark.book_title}</p>
                  <p className="text-slate-500">
                    Seite {bookmark.page_number} · {bookmark.label || 'Lesezeichen'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Noch keine Bookmarks.</p>
          )}
        </div>
        <div>
          <p className="eyebrow mb-2">Notizen</p>
          {workspace?.notes.length ? (
            <div className="space-y-1.5">
              {workspace.notes.slice(0, 6).map((note) => (
                <div key={note.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                  <p className="font-medium text-slate-900">{note.book_title}</p>
                  <p className="line-clamp-2 text-slate-500">{note.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Noch keine Notizen.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function DashboardView({
  workspace,
  onOpenBook,
  onChanged,
}: {
  workspace: UserWorkspace | null
  onOpenBook: (book: Book, pageNumber?: number, highlightTerm?: string) => void
  onChanged: () => Promise<void>
}) {
  const savedMedia = workspace?.saved_media ?? []
  const highlights = workspace?.highlights ?? []
  const notes = workspace?.notes ?? []

  function bookFromHighlight(highlightBookId: string): Book | null {
    const saved = savedMedia.find((entry) => entry.book.id === highlightBookId)
    return saved?.book ?? null
  }

  async function removeHighlight(id: string) {
    if (!confirm('Highlight wirklich löschen?')) return
    await api.deleteHighlight(id)
    await onChanged()
  }

  async function removeNote(id: string) {
    if (!confirm('Notiz wirklich löschen?')) return
    await api.deleteNote(id)
    await onChanged()
  }

  function openHighlight(highlight: { book_id: string; page_number: number; selected_text: string }) {
    const book = bookFromHighlight(highlight.book_id)
    if (!book) return
    onOpenBook(book, highlight.page_number, highlight.selected_text)
  }

  function openNote(note: { book_id: string; page_number?: number | null }) {
    const saved = savedMedia.find((entry) => entry.book.id === note.book_id)
    if (!saved) return
    onOpenBook(saved.book, note.page_number ?? undefined)
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Star className="h-4 w-4 text-indigo-600" /> Gemerkte Bücher
          </h3>
          <p className="card-description">Schneller Zugriff auf deine Merkliste</p>
        </div>
        <div className="card-body pt-3">
          {savedMedia.length === 0 ? (
            <p className="muted">Noch keine gemerkten Titel.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {savedMedia.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpenBook(entry.book)}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:shadow-sm"
                >
                  <BookCover book={entry.book} size="sm" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium text-slate-900">{entry.book.title}</span>
                    {entry.book.authors && (
                      <span className="mt-0.5 line-clamp-1 block text-xs text-slate-500">{entry.book.authors}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {entry.book.media_type === 'journal' ? 'Zeitschrift' : 'Buch'}
                      {entry.book.year ? ` · ${entry.book.year}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Meine Highlights
          </h3>
          <p className="card-description">Markierte Textstellen verwalten</p>
        </div>
        <div className="card-body pt-3">
          {highlights.length === 0 ? (
            <p className="muted">Noch keine Highlights gesetzt.</p>
          ) : (
            <ul className="space-y-2">
              {highlights.map((highlight) => {
                const canOpen = bookFromHighlight(highlight.book_id) !== null
                return (
                  <li
                    key={highlight.id}
                    className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                  >
                    <span
                      className="mt-1 inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: highlight.color || '#facc15' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-sm text-slate-800">{highlight.selected_text}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {highlight.book_title} · Seite {highlight.page_number}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {canOpen && (
                        <button
                          type="button"
                          onClick={() => openHighlight(highlight)}
                          className="btn btn-sm btn-secondary"
                        >
                          Öffnen
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeHighlight(highlight.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Highlight löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-600" /> Meine Notizen
          </h3>
          <p className="card-description">Eigene Anmerkungen nachlesen</p>
        </div>
        <div className="card-body pt-3">
          {notes.length === 0 ? (
            <p className="muted">Noch keine Notizen.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => {
                const canOpen = savedMedia.some((entry) => entry.book.id === note.book_id)
                return (
                  <li
                    key={note.id}
                    className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {note.book_title}
                        {note.page_number ? ` · Seite ${note.page_number}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {canOpen && (
                        <button
                          type="button"
                          onClick={() => openNote(note)}
                          className="btn btn-sm btn-secondary"
                        >
                          Öffnen
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeNote(note.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Notiz löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function BookManagementPanel({
  books,
  onChanged,
}: {
  books: Book[]
  onChanged: () => Promise<void>
}) {
  const [filter, setFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftMetadata>(emptyDraft())
  const [savingEdit, setSavingEdit] = useState(false)

  const filtered = books.filter((book) => {
    if (!filter.trim()) return true
    const needle = filter.toLowerCase()
    return (
      book.title.toLowerCase().includes(needle) ||
      (book.authors ?? '').toLowerCase().includes(needle) ||
      (book.specialty ?? '').toLowerCase().includes(needle) ||
      (book.isbn ?? '').toLowerCase().includes(needle)
    )
  })

  async function handleDelete(book: Book) {
    if (!confirm(`"${book.title}" wirklich aus der Datenbank löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return
    setBusyId(book.id)
    setError('')
    try {
      await api.deleteBook(book.id)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(book: Book) {
    setEditingId(book.id)
    setError('')
    setEditDraft({
      title: book.title ?? '',
      subtitle: book.subtitle ?? '',
      authors: book.authors ?? '',
      publisher: book.publisher ?? '',
      isbn: book.isbn ?? '',
      year: book.year != null ? String(book.year) : '',
      edition: book.edition ?? '',
      specialty: book.specialty ?? '',
      media_type: book.media_type,
      language: book.language ?? 'de',
      tags: (book.tags ?? []).join(', '),
      description: book.description ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(emptyDraft())
  }

  async function saveEdit(bookId: string) {
    if (!editDraft.title.trim()) {
      setError('Titel ist erforderlich')
      return
    }
    setSavingEdit(true)
    setError('')
    try {
      await api.updateBook(bookId, {
        title: editDraft.title.trim(),
        subtitle: editDraft.subtitle.trim() || null,
        authors: editDraft.authors.trim() || null,
        publisher: editDraft.publisher.trim() || null,
        isbn: editDraft.isbn.trim() || null,
        year: editDraft.year ? Number.parseInt(editDraft.year, 10) || null : null,
        edition: editDraft.edition.trim() || null,
        specialty: editDraft.specialty.trim() || null,
        media_type: editDraft.media_type,
        language: (editDraft.language || 'de').slice(0, 8),
        tags: editDraft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        description: editDraft.description.trim() || null,
      })
      await onChanged()
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600" /> Bücher verwalten
        </h3>
        <p className="card-description">{books.length} Titel in der Datenbank</p>
      </div>
      <div className="card-body space-y-3 pt-3">
        <input
          className="form-control"
          placeholder="Filtern nach Titel, Autor, ISBN, Fachgebiet..."
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
        {filtered.length === 0 ? (
          <p className="muted">Keine Bücher gefunden.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Autoren</th>
                  <th className="px-3 py-2">Fachgebiet</th>
                  <th className="px-3 py-2">Jahr</th>
                  <th className="px-3 py-2 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((book) => (
                  <Fragment key={book.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{book.title}</td>
                      <td className="px-3 py-2 text-slate-600">{book.authors ?? '–'}</td>
                      <td className="px-3 py-2 text-slate-600">{book.specialty ?? '–'}</td>
                      <td className="px-3 py-2 text-slate-600">{book.year ?? '–'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyId === book.id || savingEdit}
                            onClick={() => (editingId === book.id ? cancelEdit() : startEdit(book))}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Pencil className="h-3 w-3" />
                            {editingId === book.id ? 'Abbrechen' : 'Bearbeiten'}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === book.id || savingEdit}
                            onClick={() => void handleDelete(book)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            {busyId === book.id ? 'Lösche…' : 'Löschen'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === book.id && (
                      <tr key={`${book.id}-edit`} className="bg-indigo-50/30">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-[11px] text-slate-600">
                              Titel *
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.title}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, title: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Untertitel
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.subtitle}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, subtitle: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Autor:innen
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.authors}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, authors: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Verlag
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.publisher}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, publisher: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              ISBN
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.isbn}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, isbn: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Jahr
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.year}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, year: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Auflage
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.edition}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, edition: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Fachgebiet
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.specialty}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, specialty: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Typ
                              <select
                                className="form-control mt-0.5"
                                value={editDraft.media_type}
                                onChange={(event) =>
                                  setEditDraft({
                                    ...editDraft,
                                    media_type: event.target.value as DraftMetadata['media_type'],
                                  })
                                }
                              >
                                <option value="book">Buch</option>
                                <option value="journal">Zeitschrift</option>
                              </select>
                            </label>
                            <label className="text-[11px] text-slate-600">
                              Sprache
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.language}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, language: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600 sm:col-span-2">
                              Tags (kommagetrennt)
                              <input
                                className="form-control mt-0.5"
                                value={editDraft.tags}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, tags: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600 sm:col-span-2">
                              Beschreibung
                              <textarea
                                className="form-control mt-0.5"
                                rows={3}
                                value={editDraft.description}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, description: event.target.value })
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={cancelEdit}
                              disabled={savingEdit}
                            >
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => void saveEdit(book.id)}
                              disabled={savingEdit}
                            >
                              {savingEdit ? 'Speichere…' : 'Speichern'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function LibraryView({
  books,
  taxonomy,
  scope,
  onScopeChange,
  onOpenBook,
  onSaveBook,
  workspace,
}: {
  books: Book[]
  taxonomy: TaxonomyData
  scope: SearchScope
  onScopeChange: (next: SearchScope) => void
  onOpenBook: (book: Book) => void
  onSaveBook: (book: Book) => Promise<void>
  workspace: UserWorkspace | null
}) {
  const [mediaFilter, setMediaFilter] = useState<'all' | 'book' | 'journal'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'year' | 'specialty'>('recent')

  const filtered = useMemo(() => {
    return [...books]
      .filter((book) => mediaFilter === 'all' || book.media_type === mediaFilter)
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title)
        if (sortBy === 'year') return (b.year || 0) - (a.year || 0)
        if (sortBy === 'specialty') return (a.specialty || '').localeCompare(b.specialty || '')
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [books, mediaFilter, sortBy])

  const shelves = useMemo(() => groupBooksBySpecialty(filtered), [filtered])
  const savedIds = useMemo(
    () => new Set(workspace?.saved_media.map((entry) => entry.book.id) ?? []),
    [workspace],
  )

  return (
    <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-indigo-600" /> Bereiche
            </h3>
            <p className="card-description">Bestand nach Klinik / Fach filtern</p>
          </div>
          <div className="card-body space-y-1 pt-3">
            <ScopeTree taxonomy={taxonomy} scope={scope} onChange={onScopeChange} />
          </div>
        </div>
      </aside>

      <section className="space-y-4">
        <div className="card">
          <div className="card-body flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md bg-slate-100 p-0.5">
                {[
                  ['all', 'Alle'],
                  ['book', 'Bücher'],
                  ['journal', 'Zeitschriften'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`tab ${mediaFilter === value ? 'tab-active' : ''}`}
                    onClick={() => setMediaFilter(value as 'all' | 'book' | 'journal')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                className="form-control h-8 w-40 text-xs"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as 'recent' | 'title' | 'year' | 'specialty')}
              >
                <option value="recent">Sortieren: Neueste</option>
                <option value="title">Sortieren: Titel</option>
                <option value="year">Sortieren: Jahr</option>
                <option value="specialty">Sortieren: Fachgebiet</option>
              </select>
            </div>
            <div className="text-xs text-slate-500">
              {filtered.length} Titel · {describeScope(scope, taxonomy)}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyShelf />
        ) : (
          shelves.map((shelf) => (
            <Shelf
              key={shelf.label}
              label={shelf.label}
              books={shelf.books}
              onOpen={onOpenBook}
              onSave={onSaveBook}
              savedIds={savedIds}
            />
          ))
        )}
      </section>
    </div>
  )
}

function ScopeTree({
  taxonomy,
  scope,
  onChange,
}: {
  taxonomy: TaxonomyData
  scope: SearchScope
  onChange: (next: SearchScope) => void
}) {
  const allLabel = 'Gesamter Bestand'
  if (taxonomy.clinics.length === 0) {
    return <p className="muted">Noch keine Bereiche angelegt. Lege Kliniken & Fachbereiche im Adminbereich an.</p>
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`nav-item ${!scope.clinicId ? 'nav-item-active' : ''}`}
        onClick={() => onChange({})}
      >
        <Library className="h-3.5 w-3.5" /> {allLabel}
      </button>
      {taxonomy.clinics.map((clinic) => {
        const clinicActive = scope.clinicId === clinic.id
        const departments = taxonomy.departments.filter((d) => d.clinic_id === clinic.id)
        return (
          <div key={clinic.id} className="rounded-md">
            <button
              type="button"
              className={`nav-item ${clinicActive && !scope.departmentId ? 'nav-item-active' : ''}`}
              onClick={() =>
                onChange({ clinicId: clinic.id, departmentId: undefined, categoryId: undefined })
              }
            >
              <Building2 className="h-3.5 w-3.5" /> {clinic.name}
            </button>
            {clinicActive && departments.length > 0 && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                {departments.map((department) => {
                  const deptActive = scope.departmentId === department.id
                  const categories = taxonomy.categories.filter((c) => c.department_id === department.id)
                  return (
                    <div key={department.id}>
                      <button
                        type="button"
                        className={`nav-item ${deptActive && !scope.categoryId ? 'nav-item-active' : ''}`}
                        onClick={() =>
                          onChange({
                            clinicId: clinic.id,
                            departmentId: department.id,
                            categoryId: undefined,
                          })
                        }
                      >
                        <FolderTree className="h-3.5 w-3.5" /> {department.name}
                      </button>
                      {deptActive && categories.length > 0 && (
                        <div className="ml-3 space-y-0.5 border-l border-slate-200 pl-2">
                          {categories.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              className={`nav-item ${scope.categoryId === category.id ? 'nav-item-active' : ''}`}
                              onClick={() =>
                                onChange({
                                  clinicId: clinic.id,
                                  departmentId: department.id,
                                  categoryId: category.id,
                                })
                              }
                            >
                              <span className="ml-1 text-[10px]">▸</span> {category.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SearchView({
  query,
  searching,
  hits,
  books,
  scope,
  taxonomy,
  onScopeChange,
  onOpenBook,
  onOpenHit,
  onClear,
}: {
  query: string
  searching: boolean
  hits: SearchHit[]
  books: Book[]
  scope: SearchScope
  taxonomy: TaxonomyData
  onScopeChange: (next: SearchScope) => void
  onOpenBook: (book: Book) => void
  onOpenHit: (book: Book, pageNumber: number) => void
  onClear: () => void
}) {
  const grouped = useMemo(() => groupHitsByBook(hits), [hits])
  const additional = useMemo(() => {
    const seen = new Set(grouped.map((entry) => entry.book.id))
    return books.filter((book) => !seen.has(book.id))
  }, [books, grouped])

  return (
    <div className="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Filter</h3>
            <p className="card-description">Suche auf einen Bereich eingrenzen</p>
          </div>
          <div className="card-body space-y-1 pt-3">
            <ScopeTree taxonomy={taxonomy} scope={scope} onChange={onScopeChange} />
          </div>
        </div>
      </aside>

      <section className="space-y-4">
        <div className="card">
          <div className="card-body flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Suchergebnisse</p>
              <h2 className="truncate text-lg font-semibold text-slate-900">
                {query || 'Bitte Begriff eingeben'}
              </h2>
              <p className="text-xs text-slate-500">
                {hits.length} Treffer im Volltext · {books.length} passende Titel · {describeScope(scope, taxonomy)}
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClear}>
              Suche zurücksetzen
            </button>
          </div>
        </div>

        {searching && <p className="muted">Suche läuft …</p>}

        {!searching && grouped.length === 0 && books.length === 0 && (
          <div className="card">
            <div className="card-body py-10 text-center">
              <p className="text-sm font-medium text-slate-900">Keine Treffer</p>
              <p className="mt-1 text-xs text-slate-500">
                Tipp: Mit <code className="font-mono">*</code> verlängern (z. B. <code className="font-mono">meningi*</code>),
                {' '}mit <code className="font-mono">-wort</code> ausschließen oder{' '}
                <code className="font-mono">OR</code> für Alternativen verwenden.
              </p>
            </div>
          </div>
        )}

        {grouped.length > 0 && (
          <div className="space-y-2">
            {grouped.map((entry) => (
              <SearchResultCard
                key={entry.book.id}
                entry={entry}
                query={query}
                onOpen={() => onOpenBook(entry.book)}
                onOpenHit={(pageNumber) => onOpenHit(entry.book, pageNumber)}
              />
            ))}
          </div>
        )}

        {additional.length > 0 && (
          <section className="card">
            <div className="card-header">
              <h3 className="card-title">Treffer im Titel / Metadaten</h3>
              <p className="card-description">
                Bücher, die zur Anfrage passen, aber (noch) keinen OCR-Volltext-Treffer haben
              </p>
            </div>
            <div className="card-body pt-3">
              <BookGrid books={additional.slice(0, 24)} onOpen={onOpenBook} />
            </div>
          </section>
        )}
      </section>
    </div>
  )
}

function SearchResultCard({
  entry,
  query,
  onOpen,
  onOpenHit,
}: {
  entry: { book: Book; hits: SearchHit[] }
  query: string
  onOpen: () => void
  onOpenHit: (pageNumber: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entry.hits : entry.hits.slice(0, 3)
  return (
    <article className="search-card">
      <button type="button" className="search-card-cover" onClick={onOpen} aria-label={`${entry.book.title} öffnen`}>
        <BookCover book={entry.book} size="sm" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <button type="button" className="text-left" onClick={onOpen}>
            <h3 className="line-clamp-1 text-sm font-semibold text-slate-900 hover:text-indigo-700">
              {entry.book.title}
            </h3>
          </button>
          <span className="text-[11px] text-slate-500">
            {[entry.book.authors, entry.book.year].filter(Boolean).join(' · ') || 'MedLib'}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
          {entry.book.specialty || 'Allgemein'} · {entry.hits.length} Treffer
        </p>
        <div className="mt-2 space-y-1.5">
          {visible.map((hit, index) => (
            <button
              key={`${hit.page_number ?? 'na'}-${index}`}
              type="button"
              className="snippet block w-full rounded-md border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-left text-[12px] leading-5 text-slate-700 hover:border-amber-200"
              onClick={() => (hit.page_number ? onOpenHit(hit.page_number) : onOpen())}
            >
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Seite {hit.page_number ?? '–'}
              </span>
              <span
                dangerouslySetInnerHTML={{
                  __html: hit.snippet?.includes('<mark>')
                    ? hit.snippet
                    : highlightTerm(hit.snippet ?? '', query),
                }}
              />
            </button>
          ))}
        </div>
        {entry.hits.length > 3 && (
          <button
            type="button"
            className="mt-1.5 text-[11px] font-medium text-indigo-700 hover:text-indigo-800"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Weniger anzeigen' : `${entry.hits.length - 3} weitere Treffer anzeigen`}
          </button>
        )}
      </div>
    </article>
  )
}

function AdminView({
  dashboard,
  onRefreshDashboard,
  onChanged,
}: {
  dashboard: DashboardOverview | null
  onRefreshDashboard: () => Promise<void>
  onChanged: () => Promise<void>
}) {
  type AdminTab = 'upload' | 'books' | 'taxonomy' | 'metrics' | 'ocr'
  const [tab, setTab] = useState<AdminTab>('upload')
  const [allBooks, setAllBooks] = useState<Book[]>([])

  async function reloadBooks() {
    try {
      setAllBooks(await api.books(''))
    } catch {
      setAllBooks([])
    }
  }

  useEffect(() => {
    void reloadBooks()
  }, [])

  async function refreshAll() {
    await Promise.all([reloadBooks(), onChanged()])
  }

  const tabs: { key: AdminTab; label: string; icon: typeof FileUp }[] = [
    { key: 'upload', label: 'Hochladen', icon: FileUp },
    { key: 'books', label: 'Bücher', icon: BookOpen },
    { key: 'taxonomy', label: 'Einsortierung', icon: FolderTree },
    { key: 'metrics', label: 'Kennzahlen', icon: Gauge },
    { key: 'ocr', label: 'OCR-Pipeline', icon: Activity },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
        {tabs.map((entry) => {
          const Icon = entry.icon
          const isActive = tab === entry.key
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {entry.label}
            </button>
          )
        })}
      </div>

      {tab === 'upload' && <UploadPanel onUploaded={refreshAll} />}
      {tab === 'books' && <BookManagementPanel books={allBooks} onChanged={refreshAll} />}
      {tab === 'taxonomy' && <TaxonomyPanel books={allBooks} onChanged={refreshAll} />}
      {tab === 'metrics' && <MetricsPanel dashboard={dashboard} onRefresh={onRefreshDashboard} />}
      {tab === 'ocr' && <OcrPipelinePanel dashboard={dashboard} onRefresh={onRefreshDashboard} />}
    </div>
  )
}

function UsersView({
  user,
  onUserChanged,
  canAdmin,
}: {
  user: User
  onUserChanged: (user: User) => void
  canAdmin: boolean
}) {
  type UserTab = 'account' | 'management'
  const [tab, setTab] = useState<UserTab>('account')

  const tabs: { key: UserTab; label: string; icon: typeof ShieldCheck }[] = [
    { key: 'account', label: 'Mein Zugang', icon: ShieldCheck },
    ...(canAdmin
      ? [{ key: 'management' as const, label: 'Benutzerverwaltung', icon: Users }]
      : []),
  ]

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
          {tabs.map((entry) => {
            const Icon = entry.icon
            const isActive = tab === entry.key
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {entry.label}
              </button>
            )
          })}
        </div>
      )}

      {tab === 'account' && <AccountPanel currentUser={user} onUserChanged={onUserChanged} />}
      {tab === 'management' && canAdmin && <UserManagementPanel currentUser={user} />}
    </div>
  )
}

/* ============================== Book grid / shelves ============================== */

function BookGrid({ books, onOpen }: { books: Book[]; onOpen: (book: Book) => void }) {
  return (
    <div className="book-grid">
      {books.map((book) => (
        <BookTile key={book.id} book={book} onOpen={() => onOpen(book)} />
      ))}
    </div>
  )
}

function Shelf({
  label,
  books,
  onOpen,
  onSave,
  savedIds,
}: {
  label: string
  books: Book[]
  onOpen: (book: Book) => void
  onSave: (book: Book) => Promise<void>
  savedIds: Set<string>
}) {
  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="card-title">{label}</h3>
          <p className="card-description">{books.length} Titel</p>
        </div>
      </div>
      <div className="card-body pt-3">
        <div className="book-grid">
          {books.map((book) => (
            <BookTile
              key={book.id}
              book={book}
              onOpen={() => onOpen(book)}
              onSave={savedIds.has(book.id) ? undefined : () => void onSave(book)}
              saved={savedIds.has(book.id)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function BookTile({
  book,
  onOpen,
  onSave,
  saved,
}: {
  book: Book
  onOpen: () => void
  onSave?: () => void
  saved?: boolean
}) {
  return (
    <article className="book-tile">
      <button type="button" className="book-tile-cover" onClick={onOpen} aria-label={`${book.title} öffnen`}>
        <BookCover book={book} size="md" />
      </button>
      <div className="book-tile-meta">
        <button type="button" className="block w-full text-left" onClick={onOpen}>
          <h4 className="book-tile-title line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 hover:text-indigo-700">
            {book.title}
          </h4>
        </button>
        <p className="line-clamp-1 text-[11px] text-slate-500">
          {book.authors || book.publisher || 'MedLib'}
          {book.year ? ` · ${book.year}` : ''}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="badge badge-slate">{book.media_type === 'journal' ? 'Journal' : 'Buch'}</span>
          {book.specialty && <span className="badge badge-indigo">{book.specialty}</span>}
        </div>
        {onSave && (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 hover:text-indigo-800"
            onClick={(event) => {
              event.stopPropagation()
              onSave()
            }}
          >
            <Star className="h-3 w-3" /> Merken
          </button>
        )}
        {saved && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <Star className="h-3 w-3" /> gemerkt
          </span>
        )}
      </div>
    </article>
  )
}

function groupBooksBySpecialty(books: Book[]): { label: string; books: Book[] }[] {
  const map = new Map<string, Book[]>()
  for (const book of books) {
    const label = (book.specialty || 'Allgemein').trim() || 'Allgemein'
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(book)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => ({ label, books: list }))
}

function groupHitsByBook(hits: SearchHit[]): { book: Book; hits: SearchHit[] }[] {
  const map = new Map<string, { book: Book; hits: SearchHit[] }>()
  for (const hit of hits) {
    const existing = map.get(hit.book.id)
    if (existing) {
      existing.hits.push(hit)
    } else {
      map.set(hit.book.id, { book: hit.book, hits: [hit] })
    }
  }
  return [...map.values()]
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

function EmptyShelf() {
  return (
    <div className="card">
      <div className="card-body py-12 text-center">
        <p className="text-sm font-medium text-slate-900">Keine Treffer im aktuellen Bereich</p>
        <p className="mt-1 text-xs text-slate-500">
          Passe Filter oder Suche an, oder lade neue Medien im Adminbereich hoch.
        </p>
      </div>
    </div>
  )
}

/* Legacy App shell removed – new shell is at top of file. */

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

function MetricsPanel({
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
          <p className="muted">Kennzahlen werden geladen …</p>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="card-title">Kennzahlen</h3>
          <p className="card-description">Bestand, Datenbank und Fachgebiete</p>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={refresh}>
          {refreshing ? 'Aktualisiere …' : 'Aktualisieren'}
        </button>
      </div>
      <div className="card-body space-y-4 pt-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.metrics.map((metric) => (
            <div key={metric.key} className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatMetricValue(metric)}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <h4 className="text-sm font-semibold text-slate-900">Datenbank</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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

function OcrPipelinePanel({
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
          <p className="muted">OCR-Pipeline wird geladen …</p>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="card-title flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600" /> OCR-Pipeline
          </h3>
          <p className="card-description">Status und Verlauf laufender Jobs</p>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={refresh}>
          {refreshing ? 'Aktualisiere …' : 'Aktualisieren'}
        </button>
      </div>
      <div className="card-body space-y-4 pt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          {dashboard.recent_jobs.length === 0 && <p className="muted">Aktuell keine OCR-Jobs.</p>}
        </div>
      </div>
    </section>
  )
}

function DashboardPanel({
  dashboard,
  onRefresh,
}: {
  dashboard: DashboardOverview | null
  onRefresh: () => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <MetricsPanel dashboard={dashboard} onRefresh={onRefresh} />
      <OcrPipelinePanel dashboard={dashboard} onRefresh={onRefresh} />
    </div>
  )
}

/* ============================== Login ============================== */

function Login({
  onLogin,
  error,
  setError,
}: {
  onLogin: (user: User) => Promise<void>
  error: string
  setError: (value: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit() {
    try {
      setError('')
      await api.login(email, password)
      await onLogin(await api.me())
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

        <div className="login-card mx-auto">
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

/* ============================== Admin sub-panels ============================== */

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
        const sourceMessages: Record<string, string> = {
          googlebooks: 'Treffer bei Google Books gefunden – bitte prüfen.',
          openlibrary: 'Treffer bei OpenLibrary gefunden – bitte prüfen.',
          filename: 'Daten aus Dateiname übernommen – bitte ergänzen.',
        }
        setInfo(
          sourceMessages[result.best.source ?? ''] ??
            'Daten gefunden – bitte prüfen.',
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
      edition: candidate.edition ?? current.edition,
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

        <div className="border-t border-slate-100 pt-3">
          <BookPlacementsOverview
            books={books}
            placements={placements}
            onChanged={async () => {
              await loadTaxonomy()
              await onChanged()
            }}
          />
        </div>
      </div>
    </section>
  )
}

function BookPlacementsOverview({
  books,
  placements,
  onChanged,
}: {
  books: Book[]
  placements: Placement[]
  onChanged: () => Promise<void>
}) {
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const placementsByBook = useMemo(() => {
    const map = new Map<string, Placement[]>()
    for (const placement of placements) {
      const list = map.get(placement.book_id) ?? []
      list.push(placement)
      map.set(placement.book_id, list)
    }
    return map
  }, [placements])

  const visibleBooks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return books.filter((book) => {
      const hasPlacements = (placementsByBook.get(book.id)?.length ?? 0) > 0
      if (filter === 'assigned' && !hasPlacements) return false
      if (filter === 'unassigned' && hasPlacements) return false
      if (!needle) return true
      return (
        book.title.toLowerCase().includes(needle) ||
        (book.authors ?? '').toLowerCase().includes(needle)
      )
    })
  }, [books, placementsByBook, filter, search])

  const assignedCount = useMemo(
    () => books.filter((book) => (placementsByBook.get(book.id)?.length ?? 0) > 0).length,
    [books, placementsByBook],
  )
  const unassignedCount = books.length - assignedCount

  async function removePlacement(placement: Placement) {
    if (!confirm('Diese Zuordnung wirklich entfernen?')) return
    setBusyId(placement.id)
    try {
      await api.deletePlacement(placement.id)
      await onChanged()
    } catch {
      // surfaced via reload; keep UI quiet
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">
          Übersicht ({assignedCount} zugeordnet, {unassignedCount} ohne Zuordnung)
        </p>
        <div className="flex gap-1">
          {(['all', 'assigned', 'unassigned'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                filter === value
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {value === 'all' ? 'Alle' : value === 'assigned' ? 'Zugeordnet' : 'Nicht zugeordnet'}
            </button>
          ))}
        </div>
      </div>
      <input
        className="form-control"
        placeholder="Buch filtern…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-72 space-y-1.5 overflow-auto rounded-md border border-slate-200 bg-white p-2">
        {visibleBooks.length === 0 ? (
          <p className="muted px-2 py-1 text-[11px]">Keine Bücher in dieser Auswahl.</p>
        ) : (
          visibleBooks.map((book) => {
            const bookPlacements = placementsByBook.get(book.id) ?? []
            return (
              <div key={book.id} className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-slate-800">{book.title}</p>
                    {book.authors && (
                      <p className="truncate text-[11px] text-slate-500">{book.authors}</p>
                    )}
                  </div>
                  {bookPlacements.length === 0 && (
                    <span className="badge badge-rose shrink-0">Nicht zugeordnet</span>
                  )}
                </div>
                {bookPlacements.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {bookPlacements.map((placement) => (
                      <li
                        key={placement.id}
                        className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-[11px] text-slate-600"
                      >
                        <span className="truncate">
                          {placement.clinic_name} / {placement.department_name}
                          {placement.category_name ? ` / ${placement.category_name}` : ''}
                        </span>
                        <button
                          type="button"
                          disabled={busyId === placement.id}
                          onClick={() => void removePlacement(placement)}
                          className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Entfernen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
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

type CoverSize = 'xs' | 'sm' | 'md' | 'lg'

const COVER_DIMENSIONS: Record<CoverSize, string> = {
  xs: 'h-10 w-7',
  sm: 'h-16 w-11',
  md: 'h-32 w-22 max-w-[120px]',
  lg: 'h-44 w-32 max-w-[140px]',
}

function BookCover({ book, size = 'md' }: { book: Book; size?: CoverSize }) {
  const dimensions = COVER_DIMENSIONS[size]
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

  const titleSize = size === 'xs' ? 'text-[7px]' : size === 'sm' ? 'text-[9px]' : size === 'lg' ? 'text-[12px]' : 'text-[10px]'
  const showMeta = size === 'md' || size === 'lg'
  const shortLen = size === 'xs' ? 3 : size === 'sm' ? 5 : size === 'lg' ? 9 : 7
  return (
    <div
      className={`cover ${dimensions} flex shrink-0 flex-col justify-between p-1.5`}
      style={{ background: coverGradient(book) }}
    >
      <p className={`${titleSize} line-clamp-3 font-semibold leading-tight text-white`}>{shortTitle(book.title, shortLen)}</p>
      {showMeta && (
        <p className="line-clamp-1 text-[8px] font-medium uppercase tracking-wide text-white/80">
          {book.specialty || (book.media_type === 'journal' ? 'Journal' : 'Buch')}
        </p>
      )}
    </div>
  )
}

/* Legacy BookShelf / EmptyShelf removed – replaced by BookGrid/Shelf/BookTile at top of file. */

/* ============================== Reader ============================== */

type FitMode = 'width' | 'page' | 'height' | 'actual' | 'custom'
type PageLayout = 'single' | 'double'

const ACTUAL_SIZE_SCALE = 96 / 72
const MIN_ZOOM = 0.4
const MAX_ZOOM = 4

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))))
}

function Reader({
  book,
  query,
  initialPage,
  initialTerm,
  onBack,
  onSave,
}: {
  book: Book
  query: string
  initialPage?: number
  initialTerm?: string
  onBack: () => void
  onSave: (book: Book) => Promise<void>
}) {
  const [pageNumber, setPageNumber] = useState(initialPage ?? 1)
  const [page, setPage] = useState<PageText | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [pdfError, setPdfError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState<FitMode>('actual')
  const [renderScale, setRenderScale] = useState(ACTUAL_SIZE_SCALE)
  const [layout, setLayout] = useState<PageLayout>('single')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [hasEmbeddedText, setHasEmbeddedText] = useState(false)
  const [matchTerm, setMatchTerm] = useState<string>(initialTerm ?? '')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [pendingHighlight, setPendingHighlight] = useState<{
    text: string
    locator: {
      page_number: number
      rects: Array<{ left: number; top: number; width: number; height: number }>
    }
  } | null>(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    let active = true
    const sourceUrl = api.bookViewerUrl(book)
    const loadingTask = getDocument({
      url: sourceUrl,
      // Asset folders are served by Vite (dev middleware) and copied to dist/pdfjs/ at build.
      // Trailing slashes are required by pdf.js.
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
      iccUrl: '/pdfjs/iccs/',
    })

    setPdfLoading(true)
    setPdfError('')
    setPdfDocument(null)
    setZoom(1)
    setRenderScale(ACTUAL_SIZE_SCALE)
    setPendingHighlight(null)

    loadingTask.promise
      .then(async (document) => {
        if (!active) {
          void document.destroy()
          return
        }
        setPdfDocument(document)
        setPageNumber((current) => Math.min(Math.max(initialPage ?? current, 1), document.numPages))
        // Detect embedded text by sampling up to the first 5 pages (cover may be image-only).
        try {
          let totalChars = 0
          const sampleCount = Math.min(document.numPages, 5)
          for (let i = 1; i <= sampleCount; i += 1) {
            const page = await document.getPage(i)
            const textContent = await page.getTextContent()
            totalChars += textContent.items.reduce(
              (sum, item) => sum + (('str' in item && typeof item.str === 'string') ? item.str.length : 0),
              0,
            )
            if (totalChars > 80) break
          }
          if (active) setHasEmbeddedText(totalChars > 80)
        } catch {
          if (active) setHasEmbeddedText(false)
        }
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

  useEffect(() => {
    if (initialPage && initialPage >= 1) setPageNumber(initialPage)
  }, [initialPage])

  useEffect(() => {
    setMatchTerm(initialTerm ?? '')
  }, [initialTerm])

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        setPageNumber((current) => Math.min(pageCount || current + 1, current + (layout === 'double' ? 2 : 1)))
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        setPageNumber((current) => Math.max(1, current - (layout === 'double' ? 2 : 1)))
      } else if (event.key === 'Escape' && isFullscreen) {
        void document.exitFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, isFullscreen, pdfDocument])

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
  const secondPageHighlights = useMemo(
    () =>
      highlights.filter(
        (highlight) =>
          highlight.page_number === pageNumber + 1 &&
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
    const text = pendingHighlight.text.trim()
    if (!text) return
    const highlight = await api.createHighlightWithLocator(
      book.id,
      pendingHighlight.locator.page_number,
      text,
      pendingHighlight.locator,
    )
    setHighlights([highlight, ...highlights])
    setPendingHighlight(null)
    setOcrRunning(false)
  }

  async function handleSelection(
    selection: {
      text: string
      locator: {
        page_number: number
        rects: Array<{ left: number; top: number; width: number; height: number }>
      }
    } | null,
  ) {
    if (!selection) {
      setPendingHighlight(null)
      setOcrRunning(false)
      return
    }
    const trimmed = selection.text.trim()
    // Text selection from text-PDF: just set it.
    if (trimmed) {
      setPendingHighlight({ ...selection, text: trimmed })
      setOcrRunning(false)
      return
    }
    // Area/marquee selection (no text) – trigger backend OCR on the cropped region.
    const rect = selection.locator.rects[0]
    if (!rect) return
    setPendingHighlight({ ...selection, text: '' })
    setOcrRunning(true)
    try {
      const result = await api.ocrRegion(book.id, selection.locator.page_number, rect)
      const text = (result.text || '').trim()
      setPendingHighlight((current) =>
        current ? { ...current, text: text || '(Kein Text im Bereich erkannt)' } : current,
      )
    } catch (error) {
      setPendingHighlight((current) =>
        current ? { ...current, text: error instanceof Error ? `OCR-Fehler: ${error.message}` : 'OCR-Fehler' } : current,
      )
    } finally {
      setOcrRunning(false)
    }
  }

  async function toggleFullscreen() {
    if (!containerRef.current) return
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen()
    } else {
      await containerRef.current.requestFullscreen()
    }
  }

  const fitButtons: { mode: FitMode; label: string; icon: typeof Maximize2; title: string }[] = [
    { mode: 'width', label: 'Breite', icon: Rows2, title: 'An Breite anpassen' },
    { mode: 'page', label: 'Seite', icon: Square, title: 'Ganze Seite' },
    { mode: 'height', label: 'Höhe', icon: Columns2, title: 'An Höhe anpassen' },
    { mode: 'actual', label: '100 %', icon: Maximize2, title: 'Originalgröße' },
  ]

  const effectiveZoom = renderScale / ACTUAL_SIZE_SCALE

  function stepZoom(delta: number) {
    if (fitMode === 'width' || fitMode === 'height' || fitMode === 'page') {
      setFitMode('custom')
      setZoom(clampZoom(effectiveZoom + delta))
      return
    }
    setZoom((current) => clampZoom(current + delta))
  }

  return (
    <section ref={containerRef} className={`reader-shell ${isFullscreen ? 'reader-fullscreen' : ''}`}>
      <div className="reader-toolbar">
        <div className="flex min-w-0 items-center gap-2">
          {!isFullscreen && (
            <button className="btn btn-sm btn-secondary" onClick={onBack} type="button">
              <ChevronLeft className="h-3.5 w-3.5" />
              Zurück
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{book.title}</p>
            <p className="truncate text-[11px] text-slate-500">
              {[book.authors, book.publisher, book.year].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <div className="reader-toolbar-controls">
          <div className="reader-toolbar-group" role="group" aria-label="Seitennavigation">
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(Math.max(1, pageNumber - (layout === 'double' ? 2 : 1)))}
              title="Vorherige Seite"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              className="reader-page-input"
              min={1}
              max={pageCount || undefined}
              value={pageNumber}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value) && value >= 1) {
                  setPageNumber(Math.min(pageCount || value, Math.max(1, Math.floor(value))))
                }
              }}
            />
            <span className="text-xs text-slate-500">/ {pageCount || '?'}</span>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              disabled={pageCount > 0 && pageNumber >= pageCount}
              onClick={() => setPageNumber(Math.min(pageCount || pageNumber + 1, pageNumber + (layout === 'double' ? 2 : 1)))}
              title="Nächste Seite"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="reader-toolbar-group" role="group" aria-label="Zoom">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => stepZoom(-0.1)}
              disabled={effectiveZoom <= MIN_ZOOM}
              title="Verkleinern"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="reader-zoom-label">{Math.round(effectiveZoom * 100)}%</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => stepZoom(0.1)}
              disabled={effectiveZoom >= MAX_ZOOM}
              title="Vergrößern"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="reader-toolbar-group" role="group" aria-label="Ansicht">
            {fitButtons.map((entry) => {
              const Icon = entry.icon
              const isActive = fitMode === entry.mode
              return (
                <button
                  key={entry.mode}
                  type="button"
                  className={`reader-fit-btn ${isActive ? 'reader-fit-btn-active' : ''}`}
                  onClick={() => {
                    setFitMode(entry.mode)
                    setZoom(1)
                  }}
                  title={entry.title}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{entry.label}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={`reader-fit-btn ${layout === 'double' ? 'reader-fit-btn-active' : ''}`}
              onClick={() => setLayout(layout === 'double' ? 'single' : 'double')}
              title="Doppelseite"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">2 Seiten</span>
            </button>
          </div>

          <div className="reader-toolbar-group" role="group" aria-label="Werkzeuge">
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => onSave(book)} title="Merken">
              <Star className="h-3.5 w-3.5" />
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => api.downloadBook(book)} title="PDF herunterladen">
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => setShowSidebar((value) => !value)}
              title={showSidebar ? 'Seitenleiste ausblenden' : 'Seitenleiste einblenden'}
            >
              {showSidebar ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => void toggleFullscreen()}
              title={isFullscreen ? 'Vollbild verlassen' : 'Vollbild'}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className={`reader-body ${showSidebar && !isFullscreen ? 'reader-body-with-sidebar' : ''}`}>
        <div ref={viewportRef} className="reader-viewport">
          {pdfLoading && <div className="pdf-status">PDF wird geladen …</div>}
          {pdfError && !pdfLoading && <div className="pdf-status pdf-status-error">{pdfError}</div>}
          {pdfDocument && !pdfError && (
            <div className={`reader-pages reader-pages-${layout}`}>
              <PdfCanvasViewer
                pdfDocument={pdfDocument}
                pageNumber={pageNumber}
                zoom={zoom}
                fitMode={fitMode}
                onScaleChange={setRenderScale}
                layout={layout}
                highlights={currentPageHighlights}
                matchTerm={matchTerm}
                allowAreaSelect={!hasEmbeddedText}
                pendingHighlight={pendingHighlight}
                onTextSelect={handleSelection}
              />
              {layout === 'double' && pageNumber + 1 <= pageCount && (
                <PdfCanvasViewer
                  pdfDocument={pdfDocument}
                  pageNumber={pageNumber + 1}
                  zoom={zoom}
                  fitMode={fitMode}
                  onScaleChange={setRenderScale}
                  layout={layout}
                  highlights={secondPageHighlights}
                  matchTerm={matchTerm}
                  allowAreaSelect={!hasEmbeddedText}
                  pendingHighlight={pendingHighlight}
                  onTextSelect={handleSelection}
                />
              )}
            </div>
          )}
        </div>

        {showSidebar && !isFullscreen && (
          <aside className="reader-sidebar">
            {!hasEmbeddedText && (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold text-slate-900">OCR-Text der aktuellen Seite</h4>
                <p className="mb-2 text-[11px] text-slate-500">Dieses PDF enthält keinen eingebetteten Text – Volltext stammt aus OCR.</p>
                <div
                  className="reader-text max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800"
                  dangerouslySetInnerHTML={{ __html: markedText }}
                />
              </section>
            )}
            <button className="btn btn-primary w-full" onClick={saveBookmark} type="button">
              Lesezeichen setzen
            </button>
            <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-slate-900">PDF-Markierung</h4>
              {pendingHighlight ? (
                <>
                  {ocrRunning && (
                    <p className="mb-1.5 text-[11px] text-amber-700">OCR läuft … Text wird aus dem markierten Bereich extrahiert.</p>
                  )}
                  <textarea
                    className="w-full text-xs leading-5"
                    rows={4}
                    value={pendingHighlight.text}
                    onChange={(event) =>
                      setPendingHighlight((current) => (current ? { ...current, text: event.target.value } : current))
                    }
                    placeholder={ocrRunning ? 'OCR läuft …' : 'Markierungstext'}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      className="btn btn-primary flex-1"
                      onClick={saveHighlight}
                      type="button"
                      disabled={ocrRunning || !pendingHighlight.text.trim()}
                    >
                      Als Highlight speichern
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => setPendingHighlight(null)} type="button">
                      Verwerfen
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-600">
                  {hasEmbeddedText
                    ? 'Text direkt im PDF markieren, dann hier als Highlight speichern.'
                    : 'Bereich im PDF mit der Maus aufziehen – der Text wird automatisch per OCR erkannt.'}
                </p>
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
                <div
                  key={highlight.id}
                  className="mb-1 flex items-start gap-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-amber-100"
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => setPageNumber(highlight.page_number)}
                    type="button"
                  >
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Seite {highlight.page_number}
                    </span>
                    {highlight.selected_text}
                  </button>
                  <button
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-amber-700 hover:bg-amber-200"
                    title="Markierung löschen"
                    onClick={async () => {
                      await api.deleteHighlight(highlight.id)
                      setHighlights((current) => current.filter((h) => h.id !== highlight.id))
                    }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
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
        )}
      </div>
    </section>
  )
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function buildNormalizedBuffer(raw: string) {
  let out = ''
  const map: number[] = []
  let lastWasSpace = true
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (/\s/.test(c)) {
      if (!lastWasSpace) {
        out += ' '
        map.push(i)
        lastWasSpace = true
      }
    } else {
      out += c
      map.push(i)
      lastWasSpace = false
    }
  }
  if (out.endsWith(' ')) {
    out = out.slice(0, -1)
    map.pop()
  }
  return { text: out, map }
}

function PdfCanvasViewer({
  pdfDocument,
  pageNumber,
  zoom,
  fitMode,
  onScaleChange,
  layout,
  highlights,
  matchTerm,
  allowAreaSelect,
  pendingHighlight,
  onTextSelect,
}: {
  pdfDocument: PDFDocumentProxy
  pageNumber: number
  zoom: number
  fitMode: FitMode
  onScaleChange: (scale: number) => void
  layout: PageLayout
  highlights: Highlight[]
  matchTerm?: string
  allowAreaSelect?: boolean
  pendingHighlight?: {
    text: string
    locator: {
      page_number: number
      rects: Array<{ left: number; top: number; width: number; height: number }>
    }
  } | null
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
  const matchLayerRef = useRef<HTMLDivElement | null>(null)
  const highlightLayerRef = useRef<HTMLDivElement | null>(null)
  const highlightsRef = useRef<Highlight[]>(highlights)
  highlightsRef.current = highlights
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    // Observe the fixed viewport area, not an ancestor whose size can be affected
    // by the rendered page itself. Otherwise fit-mode can feed back into its own scale.
    const viewport = wrapper.closest('.reader-viewport') as HTMLDivElement | null
    const target = viewport ?? wrapper

    const update = () => {
      const width = target.clientWidth
      const height = target.clientHeight
      setContainerSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !containerSize.width || !containerSize.height) return

    let active = true
    let cancelRender: (() => void) | null = null
    let cancelTextLayer = false

    setRendering(true)
    onTextSelectRef.current(null)
    if (matchLayerRef.current) matchLayerRef.current.replaceChildren()

    void pdfDocument.getPage(pageNumber).then((page) => {
      if (!active) return

      const baseViewport = page.getViewport({ scale: 1 })
      const padding = 24
      const availableWidth = Math.max(80, containerSize.width - padding * 2) / (layout === 'double' ? 2 : 1)
      const availableHeight = Math.max(80, containerSize.height - padding * 2)

      let fitScale: number
      if (fitMode === 'width') {
        fitScale = availableWidth / baseViewport.width
      } else if (fitMode === 'height') {
        fitScale = availableHeight / baseViewport.height
      } else if (fitMode === 'page') {
        fitScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)
      } else {
        // actual/custom size: 96 dpi (1 unit = 1px). The pdf default is 72dpi so scale ~= 96/72 to feel like print.
        fitScale = ACTUAL_SIZE_SCALE
      }

      const scale = Math.max(0.2, fitScale * zoom)
      onScaleChange(scale)
      const viewport = page.getViewport({ scale })
      const pixelRatio = window.devicePixelRatio || 1
      const context = canvas.getContext('2d')

      if (!context) {
        setRendering(false)
        return
      }

      const cssWidth = Math.floor(viewport.width)
      const cssHeight = Math.floor(viewport.height)

      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`

      if (pageRef.current) {
        pageRef.current.style.width = `${cssWidth}px`
        pageRef.current.style.height = `${cssHeight}px`
        // pdf.js TextLayer requires --scale-factor in CSS to size text spans correctly
        pageRef.current.style.setProperty('--scale-factor', String(scale))
      }

      if (textLayerRef.current) {
        textLayerRef.current.replaceChildren()
        textLayerRef.current.style.width = `${cssWidth}px`
        textLayerRef.current.style.height = `${cssHeight}px`
        textLayerRef.current.style.setProperty('--scale-factor', String(scale))
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      const task = page.render({ canvas, canvasContext: context, viewport })
      cancelRender = () => task.cancel()
      void page
        .getTextContent({ disableNormalization: true })
        .then((textContent) => {
          if (cancelTextLayer || !textLayerRef.current) return
          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport,
          })
          return textLayer.render().then(() => {
            if (cancelTextLayer) return
            paintMatches()
            paintHighlights()
          })
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
  }, [containerSize.width, containerSize.height, fitMode, layout, onScaleChange, pageNumber, pdfDocument, zoom])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  function paintMatches() {
    const layer = textLayerRef.current
    const matchLayer = matchLayerRef.current
    if (!layer || !matchLayer) return
    matchLayer.replaceChildren()
    const term = (matchTermRef.current ?? '').trim()
    if (!term) return
    // Build tokens: split on whitespace, strip wildcards/operators
    const tokens = term
      .split(/\s+/)
      .map((token) => token.replace(/^[-!]+/, '').replace(/[*]+$/, ''))
      .filter((token) => token.length >= 3 && token.toLowerCase() !== 'or')
    if (!tokens.length) return
    const pattern = new RegExp(
      tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'gi',
    )
    requestAnimationFrame(() => {
      const layerRect = layer.getBoundingClientRect()
      if (layerRect.width <= 0 || layerRect.height <= 0) return
      // Walk all text nodes inside the text layer and create precise ranges for each match.
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let node: Node | null = walker.nextNode()
      while (node) {
        const text = node.nodeValue ?? ''
        if (text.length >= 3) {
          pattern.lastIndex = 0
          let match: RegExpExecArray | null
          while ((match = pattern.exec(text)) !== null) {
            const start = match.index
            const end = start + match[0].length
            try {
              range.setStart(node, start)
              range.setEnd(node, end)
            } catch {
              break
            }
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width <= 0 || rect.height <= 0) continue
              if (rect.width > layerRect.width * 0.9) continue
              const box = document.createElement('div')
              box.className = 'pdf-matchBox'
              box.style.left = `${((rect.left - layerRect.left) / layerRect.width) * 100}%`
              box.style.top = `${((rect.top - layerRect.top) / layerRect.height) * 100}%`
              box.style.width = `${(rect.width / layerRect.width) * 100}%`
              box.style.height = `${(rect.height / layerRect.height) * 100}%`
              matchLayer.appendChild(box)
            }
            if (match.index === pattern.lastIndex) pattern.lastIndex += 1
          }
        }
        node = walker.nextNode()
      }
    })
  }

  function paintHighlights() {
    const layer = textLayerRef.current
    const highlightLayer = highlightLayerRef.current
    if (!layer || !highlightLayer) return
    highlightLayer.replaceChildren()
    const items = highlightsRef.current
    if (!items.length) return

    requestAnimationFrame(() => {
      const layerRect = layer.getBoundingClientRect()
      if (layerRect.width <= 0 || layerRect.height <= 0) return

      const textNodes: { node: Text; start: number; end: number }[] = []
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
      let raw = ''
      let n = walker.nextNode()
      while (n) {
        const t = n as Text
        const value = t.nodeValue ?? ''
        textNodes.push({ node: t, start: raw.length, end: raw.length + value.length })
        raw += value
        n = walker.nextNode()
      }
      if (!raw.length) return

      const norm = buildNormalizedBuffer(raw)
      const haystack = norm.text.toLowerCase()

      const locate = (rawOffset: number) => {
        for (const entry of textNodes) {
          if (rawOffset >= entry.start && rawOffset <= entry.end) {
            return { entry, offset: rawOffset - entry.start }
          }
        }
        return null
      }

      for (const highlight of items) {
        const needle = collapseWhitespace(highlight.selected_text ?? '').toLowerCase()
        if (!needle) continue
        const idx = haystack.indexOf(needle)
        if (idx < 0) continue
        const rawStart = norm.map[idx]
        const rawEnd = norm.map[idx + needle.length - 1] + 1
        const startInfo = locate(rawStart)
        const endInfo = locate(rawEnd)
        if (!startInfo || !endInfo) continue
        const startIdx = textNodes.indexOf(startInfo.entry)
        const endIdx = textNodes.indexOf(endInfo.entry)

        const rawRects: DOMRect[] = []
        for (let i = startIdx; i <= endIdx; i++) {
          const entry = textNodes[i]
          const value = entry.node.nodeValue ?? ''
          const s = i === startIdx ? startInfo.offset : 0
          const e = i === endIdx ? endInfo.offset : value.length
          if (e <= s) continue
          const slice = value.slice(s, e)
          const m = slice.match(/^(\s*)(.*?)(\s*)$/)
          const ts = s + (m?.[1].length ?? 0)
          const te = e - (m?.[3].length ?? 0)
          if (te <= ts) continue
          const sub = document.createRange()
          try {
            sub.setStart(entry.node, ts)
            sub.setEnd(entry.node, te)
            for (const r of Array.from(sub.getClientRects())) {
              if (r.width > 0.5 && r.height > 1) rawRects.push(r)
            }
          } catch {
            // ignore
          }
        }
        if (!rawRects.length) continue

        const heights = rawRects.map((r) => r.height).sort((a, b) => a - b)
        const median = heights[Math.floor(heights.length / 2)] || 0
        const tol = median * 0.6
        const buckets: { top: number; bottom: number; left: number; right: number }[] = []
        for (const r of [...rawRects].sort((a, b) => a.top - b.top || a.left - b.left)) {
          const center = r.top + r.height / 2
          const target = buckets.find((b) => Math.abs((b.top + b.bottom) / 2 - center) <= tol)
          if (target) {
            target.top = Math.min(target.top, r.top)
            target.bottom = Math.max(target.bottom, r.bottom)
            target.left = Math.min(target.left, r.left)
            target.right = Math.max(target.right, r.right)
          } else {
            buckets.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
          }
        }

        for (const b of buckets) {
          const box = document.createElement('div')
          box.className = 'pdf-highlightBox'
          box.title = highlight.selected_text
          box.style.left = `${((b.left - layerRect.left) / layerRect.width) * 100}%`
          box.style.top = `${((b.top - layerRect.top) / layerRect.height) * 100}%`
          box.style.width = `${((b.right - b.left) / layerRect.width) * 100}%`
          box.style.height = `${((b.bottom - b.top) / layerRect.height) * 100}%`
          highlightLayer.appendChild(box)
        }
      }
    })
  }

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
      return
    }

    const layerRect = layer.getBoundingClientRect()
    if (layerRect.width <= 0 || layerRect.height <= 0) return

    const rects = collectSelectionRects(range, layer, layerRect)

    if (!rects.length) {
      return
    }

    onTextSelectRef.current({
      text,
      locator: {
        page_number: pageNumber,
        rects,
      },
    })
  }

  function collectSelectionRects(range: Range, layer: HTMLDivElement, layerRect: DOMRect) {
    const rawRects: DOMRect[] = []
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const textNode = node as Text
      const value = textNode.nodeValue ?? ''
      let intersects = false
      try {
        intersects = range.intersectsNode(textNode)
      } catch {
        intersects = false
      }
      if (intersects && value) {
        const startOffset = textNode === range.startContainer ? range.startOffset : 0
        const endOffset = textNode === range.endContainer ? range.endOffset : value.length
        if (endOffset > startOffset) {
          const slice = value.slice(startOffset, endOffset)
          const match = slice.match(/^(\s*)(.*?)(\s*)$/)
          const leading = match ? match[1].length : 0
          const trailing = match ? match[3].length : 0
          const trimmedStart = startOffset + leading
          const trimmedEnd = endOffset - trailing
          if (trimmedEnd > trimmedStart) {
            const subRange = document.createRange()
            try {
              subRange.setStart(textNode, trimmedStart)
              subRange.setEnd(textNode, trimmedEnd)
              for (const rect of Array.from(subRange.getClientRects())) {
                if (rect.width > 0.5 && rect.height > 1) rawRects.push(rect)
              }
            } catch {
              // ignore
            }
          }
        }
      }
      node = walker.nextNode()
    }
    if (!rawRects.length) return []

    const heights = rawRects.map((rect) => rect.height).sort((a, b) => a - b)
    const medianHeight = heights[Math.floor(heights.length / 2)] || 0
    const lineTolerance = medianHeight * 0.6

    type LineBucket = { top: number; bottom: number; left: number; right: number }
    const buckets: LineBucket[] = []
    for (const rect of [...rawRects].sort((a, b) => a.top - b.top || a.left - b.left)) {
      const center = rect.top + rect.height / 2
      const target = buckets.find((bucket) => {
        const bucketCenter = (bucket.top + bucket.bottom) / 2
        return Math.abs(bucketCenter - center) <= lineTolerance
      })
      if (target) {
        target.top = Math.min(target.top, rect.top)
        target.bottom = Math.max(target.bottom, rect.bottom)
        target.left = Math.min(target.left, rect.left)
        target.right = Math.max(target.right, rect.right)
      } else {
        buckets.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })
      }
    }

    const result: Array<{ left: number; top: number; width: number; height: number }> = []
    for (const bucket of buckets) {
      const normalized = normalizeRect(
        new DOMRect(bucket.left, bucket.top, bucket.right - bucket.left, bucket.bottom - bucket.top),
        layerRect,
      )
      if (normalized) result.push(normalized)
    }
    return result
  }

  function normalizeRect(clientRect: DOMRect, layerRect: DOMRect) {
    if (clientRect.width <= 0 || clientRect.height <= 0) return null
    const left = Math.max(0, (clientRect.left - layerRect.left) / layerRect.width)
    const top = Math.max(0, (clientRect.top - layerRect.top) / layerRect.height)
    const right = Math.min(1, (clientRect.right - layerRect.left) / layerRect.width)
    const bottom = Math.min(1, (clientRect.bottom - layerRect.top) / layerRect.height)
    const width = right - left
    const height = bottom - top
    if (width <= 0 || height <= 0) return null
    return { left, top, width, height }
  }

  const [areaRect, setAreaRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const areaStartRef = useRef<{ x: number; y: number } | null>(null)
  const onTextSelectRef = useRef(onTextSelect)
  useEffect(() => {
    onTextSelectRef.current = onTextSelect
  }, [onTextSelect])
  const matchTermRef = useRef(matchTerm)
  useEffect(() => {
    matchTermRef.current = matchTerm
  }, [matchTerm])

  useEffect(() => {
    paintMatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTerm])

  useEffect(() => {
    paintHighlights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights])

  function handleAreaMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (!allowAreaSelect) return
    if (event.button !== 0) return
    const page = pageRef.current
    if (!page) return
    const rect = page.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    areaStartRef.current = { x, y }
    setAreaRect({ left: x, top: y, width: 0, height: 0 })
    event.preventDefault()
  }

  function handleAreaMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const start = areaStartRef.current
    if (!start) return
    const page = pageRef.current
    if (!page) return
    const rect = page.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1)
    setAreaRect({
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    })
  }

  function handleAreaMouseUp() {
    const start = areaStartRef.current
    areaStartRef.current = null
    if (!start) return
    const rect = areaRect
    if (!rect || rect.width < 0.01 || rect.height < 0.01) {
      setAreaRect(null)
      return
    }
    onTextSelectRef.current({
      text: '',
      locator: {
        page_number: pageNumber,
        rects: [rect],
      },
    })
    setAreaRect(null)
  }

  return (
    <div ref={wrapperRef} className="pdf-canvas-wrap">
      {rendering && <div className="pdf-rendering">Seite wird gerendert …</div>}
      <div ref={pageRef} className="pdf-page">
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textLayerRef} className="pdf-textLayer textLayer" onMouseUp={handleMouseUp} />
        <div ref={matchLayerRef} className="pdf-matchLayer" />
        {pendingHighlight && pendingHighlight.locator.page_number === pageNumber &&
          pendingHighlight.locator.rects.map((rect, index) => (
            <div
              key={`pending-${index}`}
              className="pdf-pendingBox"
              style={{
                left: `${rect.left * 100}%`,
                top: `${rect.top * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            />
          ))}
        {allowAreaSelect && (
          <div
            className="pdf-areaLayer"
            onMouseDown={handleAreaMouseDown}
            onMouseMove={handleAreaMouseMove}
            onMouseUp={handleAreaMouseUp}
            onMouseLeave={handleAreaMouseUp}
          >
            {areaRect && (
              <div
                className="pdf-areaBox"
                style={{
                  left: `${areaRect.left * 100}%`,
                  top: `${areaRect.top * 100}%`,
                  width: `${areaRect.width * 100}%`,
                  height: `${areaRect.height * 100}%`,
                }}
              />
            )}
          </div>
        )}
        <div ref={highlightLayerRef} className="pdf-highlightLayer" />
      </div>
    </div>
  )
}

export default App
