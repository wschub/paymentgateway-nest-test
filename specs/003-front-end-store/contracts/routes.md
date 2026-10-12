# Contract: Routes / addresses

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

React Router with browser history. Every page has its own address; reloading or opening an address directly
renders that page. The static host must fall back to `index.html` for unknown paths.

| Address | Page | Data read on open | Notes |
|---------|------|-------------------|-------|
| `/` | Gallery (home) | `GET /products` | loading / empty / error + retry; out-of-stock unselectable |
| `/product/:id` | Product detail | `GET /products/:id` | image, name, description, price, stock, quantity selector, purchase button |
| `*` (anything else) | Not found | none | message + link back to `/` |

## Behaviors

- **Reload / direct open** of `/product/:id` shows that product (FR-017, SC-008).
- **Unknown address** shows the not-found page with a link back to the gallery (FR-017).
- **Product gone / 404** on `/product/:id` shows an informative not-found/gone state and prevents the
  purchase (FR-010, FR-014).
- Navigation uses real links (`<Link>`) so keyboard and screen-reader users can move between pages.
- After each route change, focus moves to the page heading so the new page content is announced.
- Query strings and hashes are not used as state; checkout progress lives in the store, not in the URL.

## Deployment note (static hosting)

- Serve the built SPA with an `index.html` fallback (for example `serve -s dist`) so `/product/:id` and
  unknown deep links resolve to the app.
- `VITE_API_URL` is a build-time variable; `front-end/.env.example` documents it with an empty value.
