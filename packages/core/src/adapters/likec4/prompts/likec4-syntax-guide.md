## LikeC4 DSL SYNTAX REFERENCE

**Identifiers**: Letters, digits, hyphens, underscores only. No dots (dots are FQN separators). Cannot start with a digit or end with a hyphen. May start with underscore. Examples: `customer`, `payment-service`, `_internal`, `queue_1`.

**FQNs**: Dot-separated paths (`cloud.backend.api`), unique per project. Short names do not resolve across files: references to elements defined in another file must use the full FQN.

**Elements** are defined inside `model { }` blocks (two syntax forms; without a title, the title defaults to the identifier):

```text
IDENTIFIER = KIND 'title' { ... }
KIND IDENTIFIER 'title' { ... }
```

Element body (all optional): `#tag`s first, then properties, then nested elements and relationships. Element kinds, relationship kinds and tags must already be declared in `specification` (`tag critical` there, `#critical` in the model).

**Relationships**:

- Inside element body: `-> TARGET 'title'` (implicit source), `-[REL_KIND]-> TARGET` or `.REL_KIND TARGET` (typed, no arrow after `.REL_KIND`)
- Top-level in model: `SOURCE -> TARGET 'title'`, `SOURCE -[REL_KIND]-> TARGET`, `SOURCE .REL_KIND TARGET` (source required)
- `this`/`it` alias the current element; `SOURCE -> it` targets current element
- Relationship body: `#tag`s first, then `title`, `description`, `technology`, `metadata { ... }`, `link URL`

**Properties**: `title` (single line), `summary` (max 150 chars), `description` (add `summary` if over 150 chars), `technology` (single line), `#tag`, `link URL 'optional title'`, `metadata { key 'value' }`. Use triple quotes (`'''`/`"""`) for multi-line markdown in `summary`/`description`. No `notes` in `model`.

**Strings**: `'single-quoted'` or `"double-quoted"`; escape quotes with backslash (`\'` or `\"`)

**Extend** existing elements: `extend FQN { #tags; metadata { ... }; link ...; nested elements/relationships }`. No other properties.

**Anti-patterns to avoid**:

- Do NOT use dots in identifiers (`payment.api` is WRONG; use `payment-api`)
- Do NOT create relationships from parent to direct child
- Do NOT add or remove `{` or `}` braces from existing blocks
- Do NOT redefine existing elements; use `extend` instead
- Do NOT use `extend SOURCE -> TARGET`, `<->`, `[[fqn]]` links, `descriptionFile` or `diff` blocks (not supported by older LikeC4 versions)
