export type Role = 'admin' | 'librarian' | 'clinician' | 'reader'

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
}

export interface Book {
  id: string
  title: string
  subtitle?: string | null
  authors?: string | null
  publisher?: string | null
  isbn?: string | null
  year?: number | null
  edition?: string | null
  specialty?: string | null
  language: string
  tags: string[]
  description?: string | null
  is_downloadable: boolean
  source_filename: string
  page_count: number
  created_at: string
  updated_at: string
}

export interface SearchHit {
  book: Book
  page_number?: number | null
  snippet?: string | null
}

export interface PageText {
  page_number: number
  text: string
}

export interface Note {
  id: string
  book_id: string
  page_number?: number | null
  body: string
  created_at: string
}

export interface Bookmark {
  id: string
  book_id: string
  page_number: number
  label?: string | null
}

export interface Highlight {
  id: string
  book_id: string
  page_number: number
  selected_text: string
  color: string
}
