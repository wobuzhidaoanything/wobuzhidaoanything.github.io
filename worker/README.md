# Roomcraft link reader (Cloudflare Worker)

A small, separate Worker that reads product pages so the site can import furniture from links.
It's its own project (`room-planner-worker`) and doesn't touch any other Worker on your account.
The free Cloudflare plan is enough.

## What it does

- `GET /scrape?url=…` fetches a product page and returns name, photo, price, **dimensions in metres**,
  **colour options**, a best-guess furniture type, and a **3D model URL** when the store has one.
  Sources, in order: Shopify's product JSON, schema.org JSON-LD, Amazon's detail tables and colour
  lists, embedded JSON (`"width": {...}`), labelled text ("Width: 228 cm"), and size triplets
  (`80"W x 35"D x 30"H`, `W 200 x D 90 x H 75 cm`, `180 x 80 x 76 cm`). Units: mm, cm, m, in, ft,
  fractions. Package and seat dimensions are ignored.
- `GET /asset?url=…` proxies `.glb`/`.gltf`/texture files so three.js can load them across origins.

## Deploy (about 2 minutes)

```bash
cd worker
npm install
npx wrangler login     # opens the browser once
npx wrangler deploy    # prints https://room-planner-worker.<you>.workers.dev
```

Then open the site → **⋮ → Link scraper settings…**, paste that URL, and press **Test connection**.
You can also put the URL in `js/config.js` so it's the default everywhere.

`ALLOWED_ORIGINS` in `wrangler.toml` sets which sites may call the Worker (localhost is always allowed).

## Test

```bash
npm test
```

## Limits

Some stores (Amazon especially) sometimes block automated requests. The site then shows the error,
and **Add manually** pre-fills what it can guess from the link.
