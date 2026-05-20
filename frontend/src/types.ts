export type Role = 'admin' | 'librarian' | 'clinician' | 'reader'
export type MediaType = 'book' | 'journal'

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
}

export interface UserCreatePayload {
  email: string
  full_name: string
  password: string
  role: Role
}

export interface SelfPasswordPayload {
  current_password: string
  new_password: string
}

export interface DashboardMetric {
  key: string
  label: string
  value: number
}

export interface DashboardJob {
  id: string
  book_id: string
  book_title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  message?: string | null
  created_at: string
  updated_at: string
}

export interface DashboardImport {
  book_id: string
  title: string
  authors?: string | null
  specialty?: string | null
  source_filename: string
  page_count: number
  created_at: string
  ocr_status?: 'pending' | 'running' | 'completed' | 'failed' | null
  ocr_progress?: number | null
}

export interface DashboardSpecialty {
  specialty: string
  count: number
}

export interface DashboardOverview {
  metrics: DashboardMetric[]
  records_by_table: DashboardMetric[]
  job_status_counts: Record<string, number>
  recent_jobs: DashboardJob[]
  recent_imports: DashboardImport[]
  top_specialties: DashboardSpecialty[]
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
  media_type: MediaType
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

export interface Clinic {
  id: string
  name: string
  description?: string | null
}

export interface Department {
  id: string
  clinic_id: string
  name: string
  description?: string | null
}

export interface Category {
  id: string
  department_id: string
  name: string
  description?: string | null
}

export interface Placement {
  id: string
  book_id: string
  clinic_id: string
  department_id: string
  category_id?: string | null
  clinic_name?: string | null
  department_name?: string | null
  category_name?: string | null
}

export interface SavedMedia {
  id: string
  book: Book
  created_at: string
}

export interface WorkspaceBookmark {
  id: string
  book_id: string
  book_title: string
  page_number: number
  label?: string | null
  created_at: string
}

export interface WorkspaceNote {
  id: string
  book_id: string
  book_title: string
  page_number?: number | null
  body: string
  created_at: string
}

export interface UserWorkspace {
  saved_media: SavedMedia[]
  bookmarks: WorkspaceBookmark[]
  notes: WorkspaceNote[]
}
