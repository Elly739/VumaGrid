# VumaGrid Frontend

The frontend is a Next.js operations dashboard for portfolio overview, site status, alerts, and recent site performance. The root [README](../README.md) contains the full product overview, API flow, security notes, simulation limitations, and end-to-end setup instructions.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Start the FastAPI backend on `http://127.0.0.1:8013` first. For a local showcase, enable `VUMAGRID_DEMO_MODE=true` in the backend process and run `backend/simulator.py` in a separate terminal to generate changing readings.

Set `NEXT_PUBLIC_VUMAGRID_API_URL` in `.env.local` when the API is hosted at a different origin. The default is `http://127.0.0.1:8013`.

## Source layout

- `src/app/page.tsx`: operator workspaces, polling, filters, and chart rendering.
- `src/app/globals.css`: dashboard layout, visual tokens, and responsive rules.
- `src/app/layout.tsx`: root document and product metadata.
- `src/lib/api.ts`: API origin, request errors, and session-scoped bearer token handling.
