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
- `yarn playwright install chromium` — one-off, downloads the browser the component tests run in

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
yarn check            # svelte-check
yarn dev              # app on http://localhost:5173
```

Sample receipts for manual testing live in `training-data/`.

## Tests

The suite is split into two Vitest projects. Server tests run in Node and boot a throwaway
Postgres container; component tests run in real headless Chromium via Playwright.

```sh
yarn test             # everything
yarn test:server      # server tests only — parser, repo, API routes
yarn test:client      # component tests only — *.svelte.test.ts, in Chromium
```

Component tests must be named `ComponentName.svelte.test.ts`. The `.svelte.` infix is what routes
a file to the browser project; without it the test runs in Node and fails on the first browser API.

### Watching a test run (head mode)

Component tests are headless by default. To watch a real Chromium window drive them:

```sh
yarn test:client:head
```

This is watch mode, not a one-shot run — deliberately. A component test finishes in well under
a second, so headless-off on a single run just opens and closes a window too fast to read. In
watch mode the browser stays open between runs and re-renders as you edit the component.

Pass a file to keep the window readable:

```sh
yarn test:client:head src/lib/components/LineItemRow.svelte.test.ts
```

It overrides the flag per run; `headless: true` stays committed in `vite.config.ts` so CI and
everyday runs stay fast.

That override only works because `headless` sits at the **browser** level in `vite.config.ts`.
Moving it onto the instance (`instances: [{ browser: 'chromium', headless: true }]`) makes the
instance win over the CLI, and the run stays headless with no warning and no window.

### Debugging

Drop a `debugger;` statement in the test, run it headed, and open Chrome DevTools in the window
Playwright opens. Because it is a real browser, you get real computed styles and a real
accessibility tree — which is usually what you need, since most component test failures are an
element whose accessible name is not what you assumed.

```sh
yarn test:client:head src/lib/components/LineItemRow.svelte.test.ts
```

Two things worth knowing when a query times out:

- For a button, text content outranks `title` in the accessible name. An icon button like `✕`
  is named `✕` unless it carries an `aria-label`.
- The default viewport is phone-sized, so `sm:`-prefixed Tailwind rules are not in effect
  unless a test sets the width with `page.viewport(width, height)`.

For a dashboard view with per-test re-runs, `yarn vitest --ui --project client` works once you
add the optional `@vitest/ui` package; it is not currently a dependency.
