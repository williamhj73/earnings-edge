---
name: OpenAPI and Zod compatibility
description: Generated integer schemas can be incompatible with the workspace's installed Zod runtime.
---

When adding OpenAPI fields to this workspace, verify generated validation against the installed Zod version; integer schemas may emit `zod.int()` while the runtime exposes Zod 3 APIs.

**Why:** Code generation can succeed while the chained library typecheck fails because the generated validator targets a newer Zod API than the installed package.

**How to apply:** Prefer a numeric schema with explicit runtime validation/normalization when an integer field is needed, then rerun codegen and the library typecheck before using the generated types.