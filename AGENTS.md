# Notes for coding agents

- The studio is a static single-page app hosted on GitHub Pages. There is no server: don't add
  TanStack Start server functions, SSR, or secrets to client code.
- All data goes through `db` from `@/integrations/firebase/client`, a Supabase-style query API
  over Firestore. `src/integrations/firebase/db.ts` lists what it supports; anything else throws
  "not supported".
- Changing the data model means updating `schema.ts` (columns, defaults, keys, references),
  `types.ts` (row types), `firestore.rules`, and `scopeFor` in `access.ts` for collections not
  everyone may read. The rules must allow every query `scopeFor` produces.
- Check changes with `npm run typecheck` and `npm test`. README.md covers setup and deployment.
