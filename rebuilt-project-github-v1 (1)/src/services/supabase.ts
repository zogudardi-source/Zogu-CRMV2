import { createClient } from '@supabase/supabase-js';

// =================================================================================
// IMPORTANT: CONFIGURE YOUR SUPABASE CREDENTIALS HERE
// =================================================================================
// Replace the placeholder strings below with your actual Supabase Project URL and Anon Key.
// You can find these in your Supabase project settings under "API".
//
// supabaseUrl should look like: 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'
// supabaseAnonKey should look like: 'ey...<long string>..._w'
//
const supabaseUrl: string = 'https://ftrlwleeivnxmbmqalpu.supabase.co'; // <-- REPLACE THIS
const supabaseAnonKey: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0cmx3bGVlaXZueG1ibXFhbHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODMyMjMsImV4cCI6MjA3NDQ1OTIyM30.5Ju6E6XvCuPJwsq1kaXQjSxo7Tea4_zs-QZ3OzKNUU8'; // <-- REPLACE THIS
// =================================================================================

// This flag is used by the UI to show a friendly configuration message.
// It checks if the placeholder values have been replaced.
export const isSupabaseConfigured =
  supabaseUrl !== 'YOUR_SUPABASE_URL' &&
  supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY';

// To prevent the app from crashing on startup before the configuration check can happen,
// we provide the Supabase client with validly formatted, but non-functional, placeholders.
// The application logic in `App.tsx` checks `isSupabaseConfigured` and will render a
// setup screen, so this dummy client will never be used for actual API calls.
const effectiveSupabaseUrl = isSupabaseConfigured ? supabaseUrl : 'http://localhost:54321';
const effectiveSupabaseAnonKey = isSupabaseConfigured ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';


// The client is initialized here. The app logic will prevent any API
// calls from being made until the credentials are confirmed to be set.
export const supabase = createClient(effectiveSupabaseUrl, effectiveSupabaseAnonKey);