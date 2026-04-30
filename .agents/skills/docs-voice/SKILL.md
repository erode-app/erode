---
name: docs-voice
description: >-
  Enforce the project's documentation voice when writing or reviewing public-facing
  content. Triggers on edits to doc files (packages/web/src/content/docs/**/*.md) and
  README.md. Catches LLM prose patterns, marketing language, and messaging drift.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Documentation Voice

Keep Erode's public-facing docs in a consistent, honest voice. Every doc should
read like it was written by the same person who wrote `why-it-matters.md`.

## North Star

Before writing or reviewing any doc, read the voice calibration source:

```
packages/web/src/content/docs/docs/why-it-matters.md
```

That page sets the tone, the messaging, and the level of honesty. Match it.

## When to Activate

Trigger proactively when any of these files are created or edited (staged,
unstaged, or in recent commits):

- `packages/web/src/content/docs/**/*.md`
- `README.md`

When detected, say:

> Doc files changed. Want me to run docs-voice to check the writing?

## Core Messaging

These are the project's core claims. New docs should reinforce them, not
contradict or dilute them.

1. **The core story.** Architecture models rot because updating them is
   disconnected from coding. AI makes this worse by shipping structural changes
   faster than humans can review. Erode closes the loop by checking PRs
   automatically.

2. **Visibility, not enforcement.** Erode exists to make drift visible. It does
   not enforce rules or block merges.

3. **Violations are not necessarily problems.** Software evolves. New
   dependencies are natural. What matters is that changes are conscious and
   documented, not accidental.

4. **Thin models win.** The model should be nodes and connections at the system
   level. A thin model that stays true beats a detailed one nobody trusts.

5. **Connect features to the core problem.** When describing what Erode does,
   tie it back to the problem (drift goes unnoticed) and the solution (make it
   visible during code review).

## Voice Rules

### 1. Short paragraphs

Two to three sentences. One idea per paragraph. If a paragraph needs a fourth
sentence, split it.

### 2. Active voice

The subject does the action. "Erode checks every PR" not "Every PR is checked
by Erode."

### 3. Concrete over abstract

Name the thing. "Erode flags undeclared dependencies in PRs" not "The tool
provides architectural governance capabilities."

### 4. Problem first, then solution

State the pain before the fix. The reader needs to feel the problem before they
care about the answer.

### 5. No hedging

Say what it does. "Erode catches drift" not "Erode can help you potentially
identify possible drift scenarios."

### 6. Honest about limitations

If something does not work yet, say so plainly. Do not hide limitations behind
vague language or skip them entirely.

### 7. No marketing language

Banned words and phrases:

- "revolutionary", "game-changing", "cutting-edge", "next-generation"
- "best-in-class", "world-class", "industry-leading"
- "seamless", "seamlessly", "effortless", "effortlessly"
- "supercharge", "turbocharge", "unlock", "unleash"
- "leverage" (use "use"), "utilize" (use "use")
- "robust", "scalable", "enterprise-grade"
- "empower", "transform", "reimagine"
- "comprehensive solution", "holistic approach"

If you catch yourself reaching for these words, describe what the thing actually
does instead.

### 8. Blockquotes for principles only

Use `>` for short, quotable statements that express a core belief or insight.
Not for emphasis, not for callouts, not for tips. Starlight callouts
(`:::note`, `:::tip`) handle those.

## Anti-Patterns to Flag

Each pattern below includes examples. Flag every occurrence.

### Em dashes

Banned entirely. Use commas, periods, semicolons, or parentheses.

- BAD: `Erode checks PRs — flagging undeclared dependencies — before merge.`
- GOOD: `Erode checks PRs, flagging undeclared dependencies, before merge.`

### Hyperbole

- BAD: `This completely eliminates architecture drift forever.`
- GOOD: `This catches drift when it's introduced.`

### Filler phrases

Remove without replacement. The sentence is stronger without them.

- BAD: `It's worth noting that Erode checks every PR.`
- GOOD: `Erode checks every PR.`
- BAD: `As a matter of fact, the model stays current.`
- GOOD: `The model stays current.`

Other fillers to catch: "It should be noted that", "Needless to say",
"At the end of the day", "In order to" (use "to"), "Due to the fact that"
(use "because"), "At this point in time" (use "now").

### Overqualification

- BAD: `Erode essentially analyzes your PRs to actually find drift.`
- GOOD: `Erode analyzes your PRs to find drift.`

Words to catch: "actually", "essentially", "basically", "really", "very",
"quite", "rather", "somewhat", "just" (when used as filler).

### Artificial enthusiasm

No exclamation marks in body text. Reserve them for nothing.

- BAD: `Erode catches drift automatically!`
- GOOD: `Erode catches drift automatically.`

### "Let's" imperatives

- BAD: `Let's set up your first analysis.`
- GOOD: `Set up your first analysis.`

### Passive voice (when active works)

- BAD: `PRs are analyzed by the tool for architectural violations.`
- GOOD: `The tool analyzes PRs for architectural violations.`

Not all passive voice is wrong. Use judgment. "The model is defined in a
`.c4` file" is fine because the model is the subject.

### Weasel words

- BAD: `Many teams find that architecture drift causes problems.`
- GOOD: `Architecture drift causes problems.`

Words to catch: "many", "most", "some", "often", "generally", "typically"
when used to avoid making a direct statement.

### Emoji

No emoji in docs. Not in headings, not in body text, not in lists.

- BAD: `## Getting Started 🚀`
- GOOD: `## Getting started`

## Structure Conventions

### Front matter

Every doc page needs YAML front matter with `title` and `description`:

```yaml
---
title: Page Title Here
description: One-sentence summary of what this page covers.
---
```

### Headings

- Start at `##` (Starlight uses `title` from front matter as `h1`)
- Sentence case: "How it works" not "How It Works"
- No trailing punctuation
- No emoji

### Tables

Use tables for structured reference data (env vars, flags, options). Do not use
tables for prose or explanations.

### Code blocks

Always include a language label:

````markdown
```bash
npm run build
```
````

### Callouts

Use Starlight callout syntax for tips, notes, and warnings:

```markdown
:::tip
Short, actionable tip here.
:::

:::note
Context or background the reader might need.
:::

:::caution
Something that could go wrong if ignored.
:::
```

Do not use blockquotes (`>`) for this purpose.

### Internal links

Use relative paths, not absolute URLs:

- GOOD: `[configuration](../guides/configuration.md)`
- BAD: `[configuration](https://erode.dev/docs/guides/configuration)`

### "What's next" sections

Guides should end with a short section pointing to the next logical step:

```markdown
## What's next

- [Configure environment variables](../guides/configuration.md)
- [Set up CI integration](../ci/github-actions.md)
```

## Writing Workflow

1. **Read the north star.** Open `why-it-matters.md` and absorb the tone.
2. **Draft.** Write the content.
3. **Run the checklist.** Go through every item in the review checklist below.
4. **Fix violations.** Rewrite anything that fails.

## Review Checklist

Run this after every draft. Every item is a yes/no check.

### Messaging

- [ ] Content reinforces (or at least does not contradict) the five core
      messaging points above
- [ ] Features are connected to the core problem (drift) and solution
      (visibility)
- [ ] Erode is described as making drift visible, not enforcing or blocking
- [ ] Violations are framed as information, not as errors or failures
- [ ] The model is described as thin (nodes and connections), not exhaustive

### Voice

- [ ] No em dashes anywhere
- [ ] No exclamation marks in body text
- [ ] No banned marketing words
- [ ] No filler phrases
- [ ] No overqualification words used as filler
- [ ] No "Let's" imperatives
- [ ] No weasel words used to avoid direct statements
- [ ] No emoji
- [ ] No passive voice where active voice works
- [ ] Paragraphs are two to three sentences
- [ ] Blockquotes used only for principles

### Structure

- [ ] Front matter has `title` and `description`
- [ ] Headings start at `##` and use sentence case
- [ ] Code blocks have language labels
- [ ] Callouts use Starlight syntax, not blockquotes
- [ ] Internal links use relative paths
- [ ] Tables used only for reference data
- [ ] Guides end with a "What's next" section

### Content

- [ ] No claims that are not supported by what Erode actually does
- [ ] Limitations stated plainly, not hidden or omitted
- [ ] Technical terms used consistently (same word for the same concept)
