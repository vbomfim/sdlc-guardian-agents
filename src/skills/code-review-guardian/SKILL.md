---
name: code-review-guardian-tools
description: >
  Code quality linter definitions. Tells the Code Review Guardian agent
  which linters to check and run. Does NOT install anything.
  See PREREQUISITES.md for installation.
---

# Code Review Guardian Tools

## Tool Inventory

Check each linter's availability and detect project languages before scanning. Report status in the Tools Report.

| Tool | Check Command | Purpose | Relevant When |
|------|--------------|---------|---------------|
| ESLint | `eslint --version` | Style, bugs, complexity | JavaScript/TypeScript (package.json) |
| Ruff | `ruff --version` | Fast Python linter | Python projects |
| Pylint | `pylint --version` | Deep Python analysis | Python projects |
| Clippy | `cargo clippy --version` | Idiomatic Rust patterns | Rust projects (Cargo.toml) |
| dotnet format | `dotnet format --version` | C# style and analyzers | C# projects (.csproj) |
| Checkstyle | `mvn checkstyle:check` or `gradle checkstyleMain` | Java style and bugs | Java projects (pom.xml, build.gradle) |

## Scan Commands (run in parallel per language, when available)

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

