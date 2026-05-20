import type { Book, Bookmark, Highlight, Note, PageText, SearchHit, User } from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiClient {
  token = localStorage.getItem('medlib.token') ?? ''

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers)
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || response.statusText)
    }
    return response.json() as Promise<T>
  }

  async login(email: string, password: string) {
    const body = new URLSearchParams({ username: email, password })
    const response = await fetch(`${API_BASE}/api/auth/token`, { method: 'POST', body })
    if (!response.ok) throw new Error('Login fehlgeschlagen')
    const payload = (await response.json()) as { access_token: string }
    this.token = payload.access_token
    localStorage.setItem('medlib.token', this.token)
    return payload
  }

  logout() {
    this.token = ''
    localStorage.removeItem('medlib.token')
  }

  me() {
    return this.request<User>('/api/auth/me')
  }

  books(query = '') {
    return this.request<Book[]>(`/api/books${query ? `?q=${encodeURIComponent(query)}` : ''}`)
  }

  search(query: string) {
    return this.request<SearchHit[]>(`/api/books/search?q=${encodeURIComponent(query)}`)
  }

  page(bookId: string, pageNumber: number) {
    return this.request<PageText>(`/api/books/${bookId}/pages/${pageNumber}`)
  }

  notes(bookId: string) {
    return this.request<Note[]>(`/api/annotations/books/${bookId}/notes`)
  }

  bookmarks(bookId: string) {
    return this.request<Bookmark[]>(`/api/annotations/books/${bookId}/bookmarks`)
  }

  highlights(bookId: string) {
    return this.request<Highlight[]>(`/api/annotations/books/${bookId}/highlights`)
  }

  createNote(bookId: string, pageNumber: number, body: string) {
    return this.request<Note>('/api/annotations/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, page_number: pageNumber, body })
    })
  }

  createBookmark(bookId: string, pageNumber: number, label?: string) {
    return this.request<Bookmark>('/api/annotations/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, page_number: pageNumber, label })
    })
  }

  createHighlight(bookId: string, pageNumber: number, selectedText: string) {
    return this.request<Highlight>('/api/annotations/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId, page_number: pageNumber, selected_text: selectedText, color: 'yellow' })
    })
  }

  uploadBook(formData: FormData) {
    return this.request<Book>('/api/books', { method: 'POST', body: formData })
  }

  async downloadBook(book: Book) {
    const headers = new Headers()
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
    const response = await fetch(`${API_BASE}/api/books/${book.id}/file`, { headers })
    if (!response.ok) throw new Error('Download fehlgeschlagen')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = book.source_filename
    link.click()
    URL.revokeObjectURL(url)
  }
}

export const api = new ApiClient()
