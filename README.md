# RM Holdings Ltd

Integrated business management platform for RM Holdings Ltd — one application, one database, central authentication, and separate business modules.

## Run locally

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be taken to the unified sign-in page.

Sign in at `/login` with a Supabase Auth account. Super Admin lands on `/dashboard`.

## Architecture

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth is the authentication source of truth
- School transport (buses, drivers, routes, fuel, maintenance) lives inside School Management
