---
name: linearis
description: Interact with Linear.app for issue tracking. Use when working with Linear tickets (format ABC-123), creating issues, updating status, or downloading attachments. Triggers on ticket references, issue management, or when user mentions Linear.
allowed-tools: Bash
---

# Linear Issue Tracking

We track tickets and projects in Linear (https://linear.app). Use the `linearis` CLI tool via Bash.

**Run `linearis usage` to see all available commands and options.**

## Quick Reference

| Command                                                        | Purpose                         |
| -------------------------------------------------------------- | ------------------------------- |
| `linearis issues read ABC-123`                                 | Get issue details + attachments |
| `linearis issues search "keyword"`                             | Search issues                   |
| `linearis issues create "Title" --team Team`                   | Create issue                    |
| `linearis issues update ABC-123 --status "Done"`               | Update issue                    |
| `linearis comments create ABC-123 --body "text"`               | Add comment                     |
| `linearis documents list --issue ABC-123`                      | List attached docs              |
| `linearis embeds download "<url>" --output ./file --overwrite` | Download attachment             |

## Conventions

- Ticket format: `ABC-<number>` (e.g., `FOR-123`)
- Always reference tickets by their identifier
- When creating subtasks, use parent ticket's project by default
- If project unclear when creating tickets, ask the user

## Workflow: Starting Work on an Issue

When the user asks to start working on a Linear issue, **these steps must be included in your plan** (using TodoWrite or similar planning tools):

1. **Read the issue details:**

   ```bash
   linearis issues read ABC-123
   ```

2. **Switch to main branch:**
   - Ensures you're creating the feature branch from the latest main
   - Avoids creating branches from other feature branches

   ```bash
   git checkout main
   git pull origin main
   ```

3. **Create a feature branch:**
   - Branch name format: `feature/ABC-123-brief-description`
   - Example: `feature/FOR-123-add-costs-projection`

   ```bash
   git checkout -b feature/ABC-123-brief-description
   ```

4. **Update issue status to "In Progress":**

   ```bash
   linearis issues update ABC-123 --status "In Progress"
   ```

5. **Implement the feature:**
   - Follow the task requirements from the issue description
   - Add progress comments as needed

6. **Verify implementation and get user sign-off:**
   - Before committing, verify the implementation matches the plan
   - Suggest running: `/verify-plan <PLAN-PATH>` (if a plan file exists)
   - Wait for explicit user approval before proceeding to create the PR
   - This ensures the work meets requirements and follows the intended approach

7. **When complete and approved, create a pull request:**

   ```bash
   git push -u origin feature/ABC-123-brief-description
   gh pr create --title "ABC-123: Brief description" --body "Resolves ABC-123\n\n## Summary\n- Implemented feature...\n\n## Test plan\n- [ ] Tested scenario..."
   ```

8. **Update issue status to "In Review":**

   ```bash
   linearis issues update ABC-123 --status "In Review"
   ```

**Critical:** When planning work on a Linear issue, include ALL these workflow steps in your TodoWrite plan. Don't just implement the feature - the plan must include branch creation at the start, user sign-off verification before committing, and PR creation at the end.

## Workflow: Investigating an Issue

When the user asks to investigate/explore/look into a Linear issue (without immediately implementing):

1. **Read the issue details** with `linearis issues read ABC-123`
2. **Search the codebase** for related files (grep for keywords, component names, API endpoints mentioned in the ticket)
3. **Summarize findings** directly to the user with:
   - Ticket requirements and acceptance criteria
   - Relevant files and their roles
   - Proposed implementation approach
   - Open questions or blockers
   - Estimated complexity (S/M/L)

Always produce a visible summary even if the investigation is cut short. The summary is the deliverable.

## Working with Issues

**Read issue with attachments:**

```bash
linearis issues read ABC-123
```

Returns JSON including an `embeds` array containing uploaded files (screenshots, documents, etc.) with signed download URLs and expiration timestamps.

**Download attachments to `.linear-tmp/` (gitignored):**

```bash
mkdir -p .linear-tmp
linearis embeds download "https://uploads.linear.app/..." --output .linear-tmp/screenshot.png --overwrite
```

## Progress Updates

- When task status changes in ticket description (e.g., `- [ ] task` → `- [x] task`), update the description accordingly
- When adding progress reports (more than checkbox changes), add as ticket comment:

```bash
linearis comments create ABC-123 --body "Progress update: ..."
```

## Authentication

A project-local token file `.linear_api_token` exists in the project root. **Always** pass it explicitly when running linearis commands:

    linearis --api-token "$(cat .linear_api_token)" <command>

Do NOT rely on `~/.linear_api_token` or `LINEAR_API_TOKEN` env var — those may belong to a different team.

Docs: https://github.com/czottmann/linearis
