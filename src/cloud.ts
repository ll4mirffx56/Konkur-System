import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabase = url && publishableKey ? createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export type MoroorCloudPayload = {
  version: 1
  reviews: unknown[]
  performance: unknown[]
  intervals: number[]
  theme: 'dark' | 'light'
  panelOrder: string[]
  reduceMotion: boolean
}

export function cloudConfigured(): boolean { return Boolean(supabase) }
