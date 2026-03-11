---
name: code-review-guardian-tools
description: >
  Code quality linter definitions. Tells the Code Review Guardian agent
  which linters to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Code Review Guardian Tools

## Required Tools (per detected language — stop and ask user to install if missing)

| Tool | Check Command | Purpose | Language |
|------|--------------|---------|----------|
| ESLint | `eslint --version` | Style, bugs, complexity | JavaScript/TypeScript |
| Ruff | `ruff --version` | Fast Python linter | Python |
| Pylint | `pylint --version` | Deep Python analysis | Python |
| Clippy | `cargo clippy --version` | Idiomatic Rust patterns | Rust |
| dotnet format | `dotnet format --version` | C# style and analyzers | C# |
| Checkstyle | `mvn checkstyle:check` or `gradle checkstyleMain` | Java style and bugs | Java |

## Scan Commands (run in parallel per language)

```
# JavaScript/TypeScript
eslint . --no-error-on-unmatched-pattern --format compact

# Python
ruff check .
pylint --disable=C0114,C0115,C0116 --score=yes <files>

# Rust
cargo clippy --message-format=short

# C#
dotnet format --verify-no-changes --verbosity minimal

# Java
mvn checkstyle:check -q
```

