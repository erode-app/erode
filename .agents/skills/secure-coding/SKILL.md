# Secure Coding Patterns

Apply these patterns when writing code that handles tokens, paths, shell commands,
external input, or output formatting.

## Shell Commands

- Always use `execFile` (array args) over `exec` (string interpolation).
- Never interpolate untrusted values into shell scripts with double quotes.
  Use single quotes and escape embedded single quotes: `str.replace(/'/g, "'\\\\''")`.
- Use `mkdtemp()` for temp files containing secrets, not predictable PID-based paths.
- Clean up temp directories with `rm(dir, { recursive: true, force: true })` in `finally` blocks.

## Path Containment

After `path.join(base, userInput)`, always verify the resolved path stays within `base`:

```typescript
const resolved = path.resolve(result);
if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
  throw new ConfigurationError('Path must be within the base directory');
}
```

## Schema Constraints for Interpolated Values

Zod schemas for AI/external output that will be interpolated into structured text
(DSL, markdown, shell) must have `.regex()` patterns and `.max()` bounds.
Never accept bare `z.string()` for values that become part of DSL or code.

- Component IDs: `z.string().regex(/^[a-zA-Z0-9._-]+$/)`
- DSL text fields: `z.string().regex(/^[^\n\r'"{}[\]`\\]+$/).max(500)`
- Arrays from AI output: Always add `.max()` bounds

As defense-in-depth, strip DSL delimiters (`'`, `"`) in `generateDslLines()` methods
even if the schema already rejects them.

## Markdown Output

Escape `[`, `]`, `(`, `)` in user-controlled values before interpolating into markdown links:

```typescript
function escapeMarkdownLink(text: string): string {
  return text.replace(/[[\]()]/g, '\\$&');
}
```

## Pagination and Redirect Safety

Validate that `next`/redirect URLs share the same origin as the base URL before following
them with auth headers:

```typescript
if (page.next) {
  const nextOrigin = new URL(page.next).origin;
  if (nextOrigin !== new URL(this.baseUrl).origin) {
    throw new ApiError('Pagination URL origin mismatch', ...);
  }
}
```

## Secret Handling

- Never embed tokens in URLs. Use `GIT_ASKPASS` or env vars instead.
- Use single quotes in generated shell scripts that echo secrets.
- Strip URL credentials from error messages before logging:
  `message.replace(/https:\/\/[^@]+@/g, 'https://')`.

## Error Messages

- Separate internal errors (may contain paths, URLs, tokens) from user-facing messages.
- Never propagate raw git/HTTP error messages to PR comments or CI output.
- The `ErodeError` constructor's `userMessage` parameter is for user-facing text;
  the `message` parameter is for internal logs. Use `stripUrlCredentials()` on internal messages.

## Git Ref Validation

Validate git refs before passing to `git clone --branch`:

```typescript
if (!/^[a-zA-Z0-9._/-]+$/.test(ref)) {
  throw new ConfigurationError('Invalid model ref');
}
```

## Branch Name Sanitization

When constructing branch names from external input, strip all characters except `[a-zA-Z0-9._-/]`.
