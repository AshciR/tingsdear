# Code Style

## Function size

Keep functions small and single-purpose. If a function does multiple discrete steps, extract each step into its own named function.

- **Hard ceiling**: ~30 lines of body. If you're approaching that, stop and decompose.
- **Transaction callbacks** (`db.transaction(async (tx) => { ... })`) should orchestrate calls to small helpers — never inline the work. Each find-or-create, insert, or update step belongs in its own function that takes `tx` as its first argument.
- **Prefer naming over commenting**: a well-named helper replaces a `// step 3:` comment.
- **One level of abstraction per function**: the top-level function reads like a summary; the helpers do the work.

Avoid 50+ line monoliths that mix orchestration with low-level query construction.
