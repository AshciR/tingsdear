# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.15.3 create --template minimal --types ts --add prettier eslint vitest="usages:unit,component" tailwindcss="plugins:none" sveltekit-adapter="adapter:node" --install yarn tingsdear
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Tracer setup

The tracer walks a receipt through `upload → parse → verify → save`: the page posts an image or
PDF to `/api/receipts/parse`, which asks Claude for structured line items, then shows them for
correction before `/api/receipts/save` writes chain, location, items and prices to Postgres.

### Prerequisites

- Docker (for the Postgres + PostGIS container, and for the Testcontainers-backed tests)
- Node 24 and yarn

### Environment

Set these in `.env`:

| Variable            | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`      | `postgres://postgres:postgres@localhost:55432/tdd` for local dev |
| `RECEIPT_EXTRACTOR` | Anthropic API key used by the receipt parser                     |

### Database

```sh
./scripts/dev-up.sh   # resets the container, starts it, runs migrations
yarn db:migrate       # migrations only, against an already-running database
```

### Run

```sh
yarn test:server      # server tests (boots its own throwaway Postgres container)
yarn check            # svelte-check
yarn dev              # app on http://localhost:5173
```

Sample receipts for manual testing live in `training-data/`.
