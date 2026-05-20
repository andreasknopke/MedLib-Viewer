import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, FileUp, Library, LogOut, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from './api'
import type { Book, Bookmark, Highlight, Note, PageText, SearchHit, User } from './types'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.me().then(setUser).then(loadBooks).catch(() => undefined)
  }, [])

  async function loadBooks() {
    setBooks(await api.books())
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-clinic-700 p-3 text-white shadow-lg shadow-sky-900/20">
              <Library className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-clinic-700">Klinikportal</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">MedLib Fachbibliothek</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">{user.full_name} · {user.role}</span>
            <button className="flex items-center gap-2 rounded-full border px-3 py-2 hover:bg-slate-100" onClick={() => { api.logout(); setUser(null) }}>
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-3xl bg-gradient-to-br from-clinic-950 via-clinic-700 to-sky-500 p-6 text-white shadow-portal">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">
              <Sparkles className="h-4 w-4" /> OCR-Archiv
            </div>
            <h2 className="mt-4 text-3xl font-bold leading-tight">Fachbücher lesen, durchsuchen, annotieren.</h2>
            <p className="mt-3 text-sm leading-6 text-sky-100">An Thieme-/Elsevier-Portalen angelehnte Oberfläche mit Klinik-Login, Volltextsuche und persönlichem Wissensarbeitsplatz.</p>
          </section>

          {(user.role === 'admin' || user.role === 'librarian') && <UploadPanel onUploaded={loadBooks} />}
          <Stats books={books} />
        </aside>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 outline-none ring-clinic-500 focus:ring-2"
                  placeholder="Diagnose, Kapitel, Autor, ISBN oder Therapie suchen …"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && runSearch()}
                />
              </div>
              <button className="rounded-2xl bg-clinic-700 px-6 font-semibold text-white hover:bg-clinic-950" onClick={runSearch}>Suchen</button>
            </div>
          </div>

          {selectedBook ? (
            <Reader book={selectedBook} query={searchQuery} onBack={() => setSelectedBook(null)} />
          ) : (
            <BookShelf books={books} hits={searchHits} query={searchQuery} onSelect={setSelectedBook} />
          )}
        </section>
      </main>
    </div>
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
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#bae6fd,transparent_36%),linear-gradient(135deg,#f8fafc,#e0f2fe)] px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-portal backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl bg-clinic-700 p-3 text-white"><ShieldCheck /></div>
          <div><p className="text-sm uppercase tracking-[0.25em] text-clinic-700">MedLib</p><h1 className="text-2xl font-bold">Klinik-Login</h1></div>
        </div>
        <label className="text-sm font-semibold text-slate-600">E-Mail</label>
        <input className="mb-4 mt-2 w-full rounded-2xl border p-3" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="text-sm font-semibold text-slate-600">Passwort</label>
        <input className="mb-6 mt-2 w-full rounded-2xl border p-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} />
        {error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="w-full rounded-2xl bg-clinic-700 py-3 font-semibold text-white hover:bg-clinic-950" onClick={submit}>Einloggen</button>
      </div>
    </div>
  )
}

function Stats({ books }: { books: Book[] }) {
  const pageCount = books.reduce((sum, book) => sum + book.page_count, 0)
  const specialties = new Set(books.map((book) => book.specialty).filter(Boolean)).size
  return (
    <div className="grid grid-cols-3 gap-3 rounded-3xl border bg-white p-4 shadow-sm">
      {[['Bücher', books.length], ['Seiten', pageCount], ['Fächer', specialties]].map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p></div>
      ))}
    </div>
  )
}

function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
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
    <form className="space-y-3 rounded-3xl border bg-white p-5 shadow-sm" onSubmit={submit}>
      <h3 className="flex items-center gap-2 font-bold"><FileUp className="h-5 w-5 text-clinic-700" /> Neues Fachbuch</h3>
      <input name="title" required className="w-full rounded-xl border p-3" placeholder="Titel" />
      <input name="authors" className="w-full rounded-xl border p-3" placeholder="Autor:innen" />
      <input name="publisher" className="w-full rounded-xl border p-3" placeholder="Verlag" />
      <div className="grid grid-cols-2 gap-2"><input name="year" type="number" className="rounded-xl border p-3" placeholder="Jahr" /><input name="specialty" className="rounded-xl border p-3" placeholder="Fachgebiet" /></div>
      <input name="tags" className="w-full rounded-xl border p-3" placeholder="Tags, kommagetrennt" />
      <input name="file" type="file" accept="application/pdf" required className="w-full rounded-xl border bg-slate-50 p-3 text-sm" />
      <button disabled={busy} className="w-full rounded-xl bg-clinic-700 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'OCR wird vorbereitet …' : 'Hochladen & OCR starten'}</button>
    </form>
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

function BookShelf({ books, hits, query, onSelect }: { books: Book[]; hits: SearchHit[]; query: string; onSelect: (book: Book) => void }) {
  const hitsByBook = useMemo(() => new Map(hits.map((hit) => [hit.book.id, hit])), [hits])
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {books.map((book) => {
        const hit = hitsByBook.get(book.id)
        return (
          <article key={book.id} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-portal">
            <div className="mb-4 flex h-44 items-end rounded-2xl bg-gradient-to-br from-slate-800 to-clinic-700 p-5 text-white">
              <div><BookOpen className="mb-3 h-8 w-8" /><h3 className="line-clamp-3 text-xl font-bold">{book.title}</h3></div>
            </div>
            <p className="text-sm font-semibold text-clinic-700">{book.specialty ?? 'Medizin'}</p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{book.authors ?? book.publisher ?? 'Unbekannte Autor:innen'}</p>
            {hit?.snippet && <p className="snippet mt-3 line-clamp-4 rounded-2xl bg-yellow-50 p-3 text-xs text-slate-700" dangerouslySetInnerHTML={{ __html: highlightTerm(hit.snippet, query) }} />}
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>{book.page_count} Seiten</span><button className="font-semibold text-clinic-700" onClick={() => onSelect(book)}>Lesen</button></div>
          </article>
        )
      })}
    </div>
  )
}

function Reader({ book, query, onBack }: { book: Book; query: string; onBack: () => void }) {
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
        <button className="flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => api.downloadBook(book)}><Download className="h-4 w-4" /> PDF</button>
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
