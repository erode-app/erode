## LikeC4 DSL SYNTAX REFERENCE

**Identifiers**: Letters, digits, hyphens, underscores only. No dots (dots are FQN separators). Cannot start with a digit or end with a hyphen. May start with underscore. Examples: `customer`, `payment-service`, `_internal`, `queue_1`.

**Elements** are defined inside `model { }` blocks (two syntax forms):

```text
IDENTIFIER = KIND 'title' { ... }
KIND IDENTIFIER 'title' { ... }
```

Element body (all optional, in order): `#tag`, properties, nested elements, relationships.

**Relationships** — two forms:

- Inside element body: `-> TARGET 'title'` (implicit source), `-[REL_KIND]-> TARGET` or `.REL_KIND -> TARGET` (typed)
- Top-level in model: `SOURCE -> TARGET 'title'` (both sides required)
- `this`/`it` alias the current element; `SOURCE -> it` targets current element

**Properties**: `title`, `summary` (max 150 chars), `description`, `notes`, `technology`, `#tag`, `link URL`, `metadata { key 'value' }`. Use triple quotes (`'''`/`"""`) for multi-line markdown in `summary`/`description`/`notes`.

**Strings**: `'single-quoted'` or `"double-quoted"` — escape quotes with backslash (`\'` or `\"`)

**Extend** (add to existing elements/relationships without redefining):

- `extend FQN { #tags; metadata { ... }; link ...; nested elements/relationships }`
- `extend SOURCE -> TARGET { ... }` — include `-[KIND]->` and `"title"` when typed relationships exist between the pair

**Anti-patterns to avoid**:

- Do NOT use dots in identifiers (`payment.api` is WRONG — use `payment-api`)
- Do NOT create relationships from parent to direct child
- Do NOT add or remove `{` or `}` braces from existing blocks
- Do NOT redefine existing elements — use `extend` instead
- Do NOT extend typed relationships without including the kind (targets wrong relation)
