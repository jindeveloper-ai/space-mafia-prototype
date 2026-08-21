# MARS.NET Supabase setup

This file contains setup steps only. Never paste secret values into this repository or Notion.

1. Create a Supabase project and run `supabase/migrations/202608220001_accounts.sql` in the SQL editor.
2. In Authentication → Providers, enable Google and add the Google OAuth client ID and secret.
3. Add the local and Render callback URLs to Supabase redirect allow list:
   - `http://127.0.0.1:4173/**`
   - `https://<service>.onrender.com/**`
4. Set these Render environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secret, server only)
   - `SUPABASE_GOOGLE_ENABLED=true`
   - `SUPABASE_APPLE_ENABLED=false`
5. Keep the service role key out of browser code, terminal screenshots, Git, logs, and documentation.

Apple sign-in remains hidden until the Apple Developer configuration is complete. When it is ready, configure the provider in Supabase, add the production return URL, set `SUPABASE_APPLE_ENABLED=true`, and schedule the Apple client-secret rotation before its six-month expiry.
