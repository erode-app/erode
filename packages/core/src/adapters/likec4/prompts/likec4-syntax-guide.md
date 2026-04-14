## LikeC4 DSL SYNTAX REFERENCE

**Identifiers**: Letters, digits, hyphens, underscores only. No dots (dots are FQN separators). Cannot start with a digit. Examples: `customer`, `payment-service`, `frontendApp`, `queue_1`.

**Elements** are defined inside `model { }` blocks:

```text
IDENTIFIER = KIND 'title' {
  #tag1 #tag2
  description 'text'
  technology 'text'
  link https://example.com
  -> TARGET 'relationship description'
  -[REL_KIND]-> TARGET 'typed relationship'
}
```

**Relationships** — two forms:

- Inside an element body, `-> TARGET` uses the current element as implicit source
- Outside element bodies (top-level in model), both sides are required: `SOURCE -> TARGET 'desc'`
- Typed relationships: `SOURCE -[REL_KIND]-> TARGET 'desc'` — only use kinds that exist in the model's specification
- `this`/`it` alias the current element inside a nested body

**Properties**: `title`, `description`, `technology`, `#tag`, `link URL`, `metadata { key 'value' }`

**Strings**: `'single-quoted'` or `"double-quoted"` — escape quotes with backslash (`\'` or `\"`)

**Anti-patterns to avoid**:

- Do NOT use dots in identifiers (`payment.api` is WRONG — use `payment-api`)
- Do NOT create relationships from parent to direct child
- Do NOT add or remove `{` or `}` braces from existing blocks
- Do NOT redefine existing elements — only add new ones
