---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Testing Rules

## BDD structure

Every `it`/`test` body must follow Given/When/Then, with explicit comments:

```ts
it('creates a chain when none exists', async () => {
  // Given
  const receipt = makeReceipt({ supermarket: { name: 'NewMart' } });

  // When
  const result = await saveReceipt(db, receipt);

  // Then
  expect(result.chainCreated).toBe(true);
});
```

- **Given**: arrange — fixtures, inputs, prior state. Omit only if there is genuinely no setup.
- **When**: act — the single behavior under test. Keep to one or two lines.
- **Then**: assert — observable outcome. Multiple `expect` calls are fine if they describe one outcome.

## Naming

- Test names describe behavior: "creates X when Y", "returns Z for empty input". Avoid "should" prefixes and method-name-based titles.
- `describe` blocks group by the unit under test (function, module, or feature).

## Other

- Mock external dependencies, not internal modules.
- Clean up side effects in `afterEach`.
- Prefer transaction rollback over `TRUNCATE` for database isolation.
