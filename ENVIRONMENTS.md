# Environment Management — Tähtiliiga

This project uses a single local environment file: `.env`.

## Setup

Create a `.env` file in the project root with the real Supabase project values:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Use these values for the real production database that the app should connect to.

## Notes

- Keep `.env` local and do not commit it.
- The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env`.
- Only use the service role key when you truly need admin-side scripts.
- No development-only demo/test database flow is used in this project anymore.

## Local run

```bash
npm start
```

After changing environment values, restart the Expo dev server so it reloads variables.
