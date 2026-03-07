---
name: code-review-guardian
description: >
  Code Review Guardian skill for installing code quality linters.
  Use this skill ONLY when the user asks to install linters, check
  linter status, or set up code review tools. Do NOT use this skill
  for running code reviews — those MUST go through the Code Review
  Guardian agent via the task tool.
---

# Code Review Guardian Skill

Handles linter **installation and setup** only. For code reviews, the Code Review Guardian agent is used instead — it runs the linters and analyzes results with Google/Microsoft/Clean Code expertise.

## When to Use

- User says "install linters", "set up code quality tools"
- User says "check linter status", "what linters do I have?"

## When NOT to Use

- User says "review my code", "check code quality" → delegate to Code Review Guardian **agent**

## Commands

### Install linters
```bash
bash ~/.copilot/skills/code-review-guardian/setup.sh
```

### Check installed linters
```bash
bash ~/.copilot/skills/code-review-guardian/setup.sh --check
```

### Install for all languages
```bash
bash ~/.copilot/skills/code-review-guardian/setup.sh --all
```
