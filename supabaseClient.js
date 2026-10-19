import { createClient } from '@supabase/supabase-js'

// Replace these with your actual keys from the Supabase dashboard
const supabaseUrl = 'https://oxllmfeqwlxnacsarrgu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94bGxtZmVxd2x4bmFjc2Fycmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMzk2MTQsImV4cCI6MjEwNzkxNTYxNH0.ZU3FVUdx0yiIQiNX6BgKROAFuzT_wEPyF-Uqb5LMwRE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
})
