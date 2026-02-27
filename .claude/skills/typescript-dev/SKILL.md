---
name: typescript-dev
description: >-
  TypeScript best practices: strict mode, ESLint rules, file naming, imports,
  type safety, Zod validation, error handling, and testing with Vitest.
  Use when writing TypeScript code, reviewing for code quality, fixing lint
  errors, creating types/interfaces, writing tests, or adding validation.
---

# TypeScript Development

## Strict Mode Essentials

Both projects use `strict: true` with these additional flags:

- `noUncheckedIndexedAccess` — array/record indexing returns `T | undefined`, must guard before use
- `noUnusedLocals` / `noUnusedParameters` — prefix unused with `_`
- `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature` (erode)

```typescript
const items = ['a', 'b', 'c'];
const first = items[0]; // type: string | undefined
// ❌ first.toUpperCase()        — might be undefined
// ✅ if (first !== undefined) { first.toUpperCase() }
```

## ESLint Rules

Both projects use `@typescript-eslint/strict-type-checked` + `stylisticTypeChecked`.

- **`eqeqeq`** — always use `===`/`!==` (erode allows `== null` via smart mode; forestry is strict)
- **`max-lines: 500`** (skipBlankLines, skipComments) — split files when approaching the limit
- **`no-unsafe-assignment`**, **`no-unsafe-member-access`** — never bypass with `as` casts
- **`restrict-template-expressions`** — only strings/numbers in template literals (erode allows numbers)
- **`prefer-nullish-coalescing`** — use `??` over `||` for nullable values
- Never suppress with `eslint-disable` — fix the root cause

```typescript
// ❌ Loose equality
if (value == '') { ... }

// ✅ Strict equality
if (value === '') { ... }

// ❌ Logical OR for nullable (falsy '' or 0 are lost)
const name = input || 'default';

// ✅ Nullish coalescing (only null/undefined trigger fallback)
const name = input ?? 'default';
```

## File Naming & Imports

Enforced via `eslint-plugin-check-file`:

- **kebab-case** for all `.ts`/`.tsx` files and `src/` folders
- **`.js` extensions** in all local ESM imports (required by both Node16 and NodeNext resolution)

```typescript
// ❌ Missing extension
import { validate } from './utils/validation';

// ✅ With .js extension
import { validate } from './utils/validation.js';

// ❌ File naming
src / utils / myHelper.ts;
src / UserService / index.ts;

// ✅ File naming
src / utils / my - helper.ts;
src / user - service / index.ts;
```

## Type Safety

- **Constrained types** over raw `string`/`number` — use literal unions, enums, or branded types for domain values with known sets
- **`unknown` over `any`** — then narrow with type guards or `instanceof`
- **`satisfies`** for type-checked object literals that preserve literal types
- **Before creating types:** search existing types, enums, and Zod schemas first — never duplicate

```typescript
// ❌ function setStatus(status: string) — raw string for known values
// ✅ type Status = 'pending' | 'active' | 'archived';
//    function setStatus(status: Status)

// ❌ function handle(input: any) { return input.name; }
// ✅ function handle(input: unknown) {
//      if (typeof input === 'object' && input !== null && 'name' in input) { ... }
//    }
```

## Zod Validation

Schema-first pattern — define Zod schema, derive type with `z.infer<>`:

- `z.coerce` for string-to-number conversion (CLI args, query params)
- Wrap `schema.parse()` in a helper that converts `ZodError` to project error type
- Keep schemas in dedicated files (`src/schemas/` or `src/validation/`), not inline in business logic

```typescript
const ConfigSchema = z.object({
  port: z.coerce.number().min(1).max(65535),
  debug: z.boolean().default(false),
});
type Config = z.infer<typeof ConfigSchema>;

// Wrap parse in helper that converts ZodError to project error type
function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(`Validation failed: ${error.issues.map((i) => i.message).join(', ')}`);
    }
    throw error;
  }
}
```

## Error Handling

Base error class with `code` (enum), `message`, and `context` metadata:

- Set `this.name` in constructor and call `Error.captureStackTrace`
- `static fromError(error: unknown)` factory for safely wrapping unknown errors
- Extend for domain-specific error types (config, API, validation)

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, AppError);
  }
  static fromError(error: unknown, code = ErrorCode.UNKNOWN): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof Error)
      return new AppError(error.message, code, { originalError: error.name });
    return new AppError(String(error), code);
  }
}
```

## Testing with Vitest

- Tests colocated near source in `__tests__/` directories
- Behavior-focused tests — test _what_ the code does, not _how_
- Test file naming: `*.test.ts`
- Use `.js` extensions in test imports too

## Avoid

- `any` type — use `unknown` and narrow
- `eslint-disable` comments — fix the root cause
- `as` type assertions to silence errors — use type guards or `satisfies`
- Duplicating existing types — search first
- `==` comparisons — use `===` (`== null` only in smart-mode projects)
- Files over 500 lines — split into focused modules
- Non-kebab-case file/folder names
- Missing `.js` extension in local imports
- Inline Zod schemas in business logic — keep in schema files
- Untyped catch blocks — `error` is `unknown`, narrow before use
- Raw `string`/`number` for domain values with known constrained sets
