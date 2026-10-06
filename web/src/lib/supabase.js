import { createClient } from '@supabase/supabase-js'

/**
 * Single Supabase client for the whole app.
 *
 * Stores import `supabase` from here — views never talk to the database
 * directly, so swapping a store from mock data to live data does not
 * change any component.
 *
 * Credentials live in `.env` (gitignored). Copy `.env.example` → `.env`,
 * fill in the anon key, then restart `npm run dev`.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey || anonKey === 'PASTE_ANON_KEY_HERE') {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env, set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY (Supabase Dashboard → Project Settings → API Keys), then ' +
      'restart npm run dev.',
  )
}

export const supabase = createClient(url, anonKey)
