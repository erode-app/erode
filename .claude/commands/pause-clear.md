# Pause and clear Command

You are generating a session handoff. This state will mark what your progress is in the plan file so we can transition the work to a fresh Claude Code session.

## Instructions

- Mark your progress in the plan file (if we are working on one)
- Mark any outstanding work in the plan file (if we are working on one)
- Pause
- Return a command to the user, e.g. `execute @<PATH_TO_PLAN_FILE> and continue` (keep the @ so it inlines the plan)

Important! This does not mean that you should commit!
