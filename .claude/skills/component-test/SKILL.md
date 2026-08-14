---
name: component-test
description: Write a behaviour-driven test for a Svelte component in this project. Use when asked to test, add tests for, or cover a `.svelte` component — or when a component is created/changed and needs a test. Encodes the vitest-browser-svelte API, accessible-query priority, and the Given/When/Then house style.
---

# Component tests

Write tests that describe what a **user** can do with the component, using the queries a user would use to find things. A test that survives a refactor but fails when the behaviour breaks is the goal.

## Before writing anything

1. **Read the component.** Note its `$props()`, the callback props it invokes, and every branch (`{#if}`, `{#each}`, disabled states, error states).
2. **Read `.claude/rules/testing.md`.** It governs Given/When/Then structure and naming. This skill does not repeat it — follow it.
3. **List the behaviours** in user terms before writing code. One `it` per behaviour. If you cannot phrase a behaviour without naming an internal variable, it is not a behaviour — skip it.

## This project's setup

- File name: **`ComponentName.svelte.test.ts`**, next to the component. The `.svelte.` infix is what routes it to the browser-mode `client` project (`vite.config.ts`). Without it the test lands in the `server` project, runs in Node, and fails confusingly.
- Library: **`vitest-browser-svelte`**, NOT `@testing-library/svelte`. Runs in real Chromium via Playwright.
- `expect: { requireAssertions: true }` is set — every test must assert, or it fails.

```ts
import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';
import LineItemRow from './LineItemRow.svelte';

describe('LineItemRow', () => {
	it('calls onDelete when the remove button is clicked', async () => {
		// Given a row rendered for a single line item
		const onDelete = vi.fn();
		const screen = render(LineItemRow, { item: makeLineItem(), onDelete });

		// When the user clicks remove
		await screen.getByRole('button', { name: 'Remove this line' }).click();

		// Then the parent is told to delete this row, once
		expect(onDelete).toHaveBeenCalledOnce();
	});
});

// Hand out a $state proxy: the component mutates what it is given, and in the real app that
// object is always reactive state owned by the page.
function makeLineItem(overrides = {}) {
	const item = $state({
		name: 'Milk',
		quantity: 1,
		unit_price: 2.5,
		total: 2.5,
		flagged: false,
		...overrides
	});
	return item;
}
```

Per `CLAUDE.md`, factory helpers go **below** the `describe` block.

## Fixtures must be `$state`

Runes work in `.svelte.test.ts` files — that is another thing the `.svelte.` infix buys you. Use them for any object a component mutates via `bind:` or direct assignment.

A plain object will often pass anyway: `bind:value={item.name}` compiles to a plain property assignment, so reading the object back works. But nothing **re-renders** — a plain fixture cannot drive `{#if item.flagged}` after the component flips the flag, and it tests a configuration that never occurs in production, where the page owns the receipt as `$state`. Put `$state` in the factory so no individual test has to think about it.

## Prefer the visible outcome over the spy

When the user's action produces something they can **see**, assert on that, not on a mock:

```ts
// Prefer — the row is actually gone
await expect.element(screen.getByPlaceholder('Item name')).not.toBeInTheDocument();

// Weaker — only proves a function was called
expect(onDelete).toHaveBeenCalledOnce();
```

A spy proves a message was sent; the DOM proves the user got what they asked for. Reach for the spy only when the component genuinely cannot show the outcome itself.

**Which component owns the outcome decides which file the test goes in.** `LineItemRow` cannot remove itself — it only invokes `onDelete`, and `VerifyView` owns the array and splices it (`VerifyView.svelte:32`). So the spy is the entire contract at the row level, while "the row disappeared" is a `VerifyView` test. If you find yourself wanting a visible assertion that the component cannot produce, that is a signal to test one level up, not to settle for the spy.

## Callback props

Stub every callback prop with `vi.fn()`, never a closure over a mutable local. The spy records arguments and call counts, so the assertion states the real contract between component and parent:

```ts
expect(onSave).toHaveBeenCalledOnce();
expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Milk' }));
```

- Prefer `toHaveBeenCalledOnce()` over `toHaveBeenCalled()` — "fired exactly once" catches double-submit bugs that "fired" does not.
- Assert the arguments whenever the component passes any. A callback that fires with the wrong payload is a bug a bare call-count assertion misses.
- Assert `expect(onDelete).not.toHaveBeenCalled()` for the negative case — that the component does **not** notify the parent when it shouldn't.
- Create the spy inside each `it`, not in module scope. Fresh spies need no `clearAllMocks` bookkeeping.

This does not conflict with "mock external dependencies, not internal modules" in the testing rules. A callback prop is the component's boundary with its parent, and the spy stands in for the parent — not for an internal module.

## API differences that will bite you

Locators are lazy and auto-retrying. This is the biggest departure from `@testing-library/svelte`:

- `await expect.element(locator).toBeInTheDocument()` — **not** `expect(locator)`. `expect.element` retries until it passes or times out; plain `expect` on a locator asserts against the locator object and is meaningless.
- `await locator.click()` / `.fill()` / `.selectOptions()` — interactions live on the locator. There is no `userEvent.setup()`.
- `render()` returns the screen, scoped to the component's container. Prefer it over importing `page`, so one test cannot see another's DOM.
- Asserting absence: `await expect.element(locator).not.toBeInTheDocument()`. Do not use `queryBy*` — that is Testing Library, not this library.

Note the split: `expect.element` for DOM, plain `expect` for spies. Locators need retrying; `vi.fn()` calls are already recorded by the time an awaited interaction resolves.

## Query priority

Find elements the way a user does. Descend this list only when the tier above genuinely does not apply:

1. `getByRole(role, { name })` — the default. `name` matches the accessible name, which includes `title`, `aria-label`, and wrapping `<label>` text.
2. `getByLabelText` — form fields with a visible label.
3. `getByPlaceholder`, `getByText` — when there is no label.
4. `getByTestId` — last resort. Adding a test id is a decision to justify in the test, not a reflex.

Never query by CSS class or tag structure. Tailwind classes are styling; asserting on them couples the test to the design.

## When the component is not accessible

You will hit components where no accessible query works. **The finding is the point** — do not route around it with a test id. Report it, and prefer fixing the component.

The failure mode to know: for a button, **text content beats `title`** in the accessible name computation. `title` is only a fallback when there is no content. A real example from this repo — the remove button was:

```svelte
<button onclick={onDelete} title="Remove this line">✕</button>
```

Its accessible name was `✕`, not `Remove this line`, so `getByRole('button', { name: 'Remove this line' })` timed out — and a screen reader announced the glyph. The fix was an `aria-label` (which outranks content), not a test id, and it improved the component for real users:

```svelte
<button onclick={onDelete} aria-label="Remove this line" title="Remove this line">✕</button>
```

Icon-only buttons are where this bites. Check them first when a `getByRole` name query times out.

## Viewport is a real variable

Because tests run in a real browser, responsive CSS actually applies. Vitest's default viewport is phone-sized (narrower than Tailwind's `sm`), so a `sm:`-prefixed rule is **not** in effect unless you ask for it. Set the width explicitly whenever the component's markup is responsive, rather than letting the default decide silently:

```ts
import { page } from 'vitest/browser'; // NOT '@vitest/browser/context' — deprecated

await page.viewport(1280, 800);
```

Viewport persists across tests in a file, so a test that sets it affects every test after it. Either set it in the `// Given` of each width-sensitive test, or leave width-agnostic tests genuinely width-agnostic.

Do not assume a hidden element is invisible to the accessibility tree. Chromium still computes an input's accessible name from a `display: none` caption inside its wrapping `<label>` — verified in this repo at 1280px against `LineItemRow`'s `sm:hidden` Qty/Unit/Total captions. **Run the test before reporting an accessibility bug**; reasoning from the spec alone will mislead you here.

## What to test, and what not to

Test:

- What renders for a given set of props, including each `{#if}` branch.
- What a user interaction produces — which callback fired, how many times, with what arguments.
- Conditional affordances: disabled buttons, validation messages, empty states.
- `bind:` behaviour through its user-visible effect (fill the field, assert on what the parent received), never by reaching for internal state.

Do not test:

- Tailwind classes, DOM nesting, or element counts as a proxy for layout.
- Svelte's own reactivity — assume the framework works.
- Anything already covered by a server test. Component tests cover the view; `src/lib/server/**` tests cover parsing and persistence.

## Debugging a failing test

Default runs are headless and fast. When a test fails and the message is not enough, escalate in this order:

**1. Narrow to one file.** Everything below is noisier across the whole suite.

```
yarn vitest --project client src/lib/components/LineItemRow.svelte.test.ts
```

This is watch mode (no `run`), which is what you want while iterating.

**2. Watch it happen.** Override headless without editing the config:

```
yarn vitest --project client --browser.headless=false src/lib/components/LineItemRow.svelte.test.ts
```

Chromium opens and you see the component render and the interactions fire. In a one-shot `vitest run` the window vanishes before it is readable — so use watch mode, where the browser stays open between runs and re-renders on save.

**3. Inspect properly.** `yarn vitest --ui --project client` gives a live view of the test DOM plus per-test re-runs — usually more useful than the raw headed window. For real inspection, put `debugger;` in the test, run headed, and open devtools: you get the actual computed styles and accessibility tree, which is the whole reason to be in a browser.

Leave `headless: true` committed in `vite.config.ts` so CI and default runs stay fast. These are per-run overrides, not config changes.

`headless` must stay at the **browser** level in `vite.config.ts`, not on the instance. `--browser.headless=false` overrides the browser-level option; an instance-level `headless: true` outranks the CLI and silently keeps the run headless with no warning. The tell is the process: headless launches `chromium_headless_shell/chrome-headless-shell`, headed launches `chromium-1223/chrome-mac-arm`. If no window appears, check that first.

**Common causes, in rough order of likelihood:**

- Asserted with `expect(locator)` instead of `await expect.element(locator)` — the assertion is vacuous or the error is about the wrong thing.
- Element has no accessible name (see the section above). Check computed styles at the current viewport before assuming the query is wrong.
- Test file missing the `.svelte.` infix, so it ran in the Node `server` project and blew up on a browser API.
- Forgot `await` on an interaction, so the assertion ran before the DOM updated.
- Spy asserted before the awaited interaction resolved — same root cause as above, different symptom.

## Finishing

Run the client project and report the actual output:

```
yarn vitest run --project client
```

If a test fails because the component has a real bug, report the bug — do not reshape the test until it passes.
