import type { Book, Bookmark, Category, Clinic, DashboardOverview, Department, Highlight, Note, PageText, Placement, SearchHit, User, UserCreatePayload, UserWorkspace } from './types'

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
    if (response.status === 204) {
      return undefined as T
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

  dashboardOverview() {
    return this.request<DashboardOverview>('/api/dashboard/overview')
  }

  clinics() {
    return this.request<Clinic[]>('/api/taxonomy/clinics')
  }

  createClinic(name: string, description?: string) {
    return this.request<Clinic>('/api/taxonomy/clinics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })
  }

  departments(clinicId?: string) {
    return this.request<Department[]>(`/api/taxonomy/departments${clinicId ? `?clinic_id=${clinicId}` : ''}`)
  }

  createDepartment(clinicId: string, name: string, description?: string) {
    return this.request<Department>('/api/taxonomy/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic_id: clinicId, name, description })
    })
  }

  categories(departmentId?: string) {
    return this.request<Category[]>(`/api/taxonomy/categories${departmentId ? `?department_id=${departmentId}` : ''}`)
  }

  createCategory(departmentId: string, name: string, description?: string) {
    return this.request<Category>('/api/taxonomy/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: departmentId, name, description })
    })
  }

  placements(bookId?: string) {
    return this.request<Placement[]>(`/api/taxonomy/placements${bookId ? `?book_id=${bookId}` : ''}`)
  }

  createPlacement(payload: { book_id: string; clinic_id: string; department_id: string; category_id?: string | null }) {
    return this.request<Placement>('/api/taxonomy/placements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }

  workspace() {
    return this.request<UserWorkspace>('/api/workspace')
  }

  saveMedia(bookId: string) {
    return this.request('/api/workspace/saved/' + bookId, { method: 'POST' })
  }

  unsaveMedia(bookId: string) {
    return this.request<void>('/api/workspace/saved/' + bookId, { method: 'DELETE' })
  }

  users() {
    return this.request<User[]>('/api/auth/users')
  }

  createUser(payload: UserCreatePayload) {
    return this.request<User>('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }

  updateUserStatus(userId: string, isActive: boolean) {
    return this.request<User>(`/api/auth/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive })
    })
  }

  updateUserPassword(userId: string, password: string) {
    return this.request<User>(`/api/auth/users/${userId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
  }

  updateUserRole(userId: string, role: string) {
    return this.request<User>(`/api/auth/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    })
  }

  deleteUser(userId: string) {
    return this.request<void>(`/api/auth/users/${userId}`, { method: 'DELETE' })
  }

  changeOwnPassword(currentPassword: string, newPassword: string) {
    return this.request<User>('/api/auth/me/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    })
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
