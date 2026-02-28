#!/bin/bash
cat << 'EOF'
SKILL EVALUATION REQUIRED: Before responding, evaluate these project skills:
- linearis: Linear tickets (ABC-123), issue management, attachments
- typescript-dev: Typescript best practices, code quality, linting, formatting
- adr: Architecture Decision Records, documentation, design rationale
- doc-sync: Documentation drift detection — CLI flags, env vars, output schemas vs docs
- docs-voice: Documentation voice enforcement for public-facing content
- git-commit: Conventional commits with project conventions

For each relevant skill: invoke Skill() tool BEFORE implementation.
EOF
exit 0
