# Craig — Auto-Scheduling Instructions

Craig is a lightweight task scheduler built into the Copilot CLI extensions. When the user asks to schedule a task, run something later, or set up recurring automation, use Craig.

## Scheduling Formats

Craig supports three scheduling formats:

| Format | Syntax | Use case |
|--------|--------|----------|
| **Cron** | `M H D Mo DoW` (5 fields) | Recurring tasks (daily, weekly, hourly) |
| **One-shot** | `once:YYYY-MM-DDTHH:MM` | Run exactly once at a specific time |
| **Event** | `on_push` | Triggered by git push events, not time-based |

### Cron expressions

Standard 5-field cron using **LOCAL TIME** (not UTC):

```
┌───────── minute (0–59)
│ ┌─────── hour (0–23) ← LOCAL TIME
│ │ ┌───── day of month (1–31)
│ │ │ ┌─── month (1–12)
│ │ │ │ ┌─ day of week (0–6, Sunday=0)
│ │ │ │ │
* * * * *
```

**Supported:** `*` (any), exact numbers, `*/N` (step/interval).
**NOT supported:** ranges (`1-5`), lists (`1,3,5`), named days (`MON`).

**Examples (all times are local/EDT):**
- `0 8 * * 1-5` → ❌ WRONG — ranges not supported
- `0 8 * * *` → ✅ Every day at 8:00 AM local time
- `30 9 * * 1` → ✅ Every Monday at 9:30 AM local time
- `0 */6 * * *` → ✅ Every 6 hours at :00
- `0 17 * * 5` → ✅ Every Friday at 5:00 PM local time

### One-shot (`once:`)

For tasks that should run exactly once at a specific time. Uses **LOCAL TIME**.

```
once:2026-04-05T14:30
```

After firing, the task is automatically removed from the schedule.

### Event-based (`on_push`)

Triggered by git push events, not by time. Not relevant for Operator tasks.

## ⚠️ Critical: Time Zone

**All times are LOCAL TIME on the machine running Copilot CLI.**

- If the user says "run at 2 PM" and they're in EDT → schedule for `14` in the hour field
- Do NOT convert to UTC — Craig's scheduler uses `new Date()` which returns local time
- The user's timezone is EDT (UTC-4)

## Craig Tools

| Tool | What it does |
|------|-------------|
| `craig_enable` | Enable Craig's scheduler for this session |
| `craig_disable` | Disable Craig's scheduler |
| `craig_status` | Show enabled/disabled state, all tasks, last/next run times |
| `craig_run` | Manually trigger a task immediately (by name) |
| `craig_schedule_add` | Add a new scheduled task (name, cron, prompt) |
| `craig_schedule_remove` | Remove a scheduled task by name |
| `craig_schedule_update` | Update the cron or prompt of an existing task |

## Routing to the Operator

Craig sends prompts to the Copilot CLI session. The orchestrator reads the prompt and routes it to the appropriate agent. For operational tasks, prefix the prompt with `"Operator:"` to signal routing:

```yaml
prompts:
  morning_dashboard: >
    Operator: Take a screenshot of the Grafana dashboard at
    https://grafana.mycompany.com/d/main
```

The orchestrator dispatches the Operator in `mode: "background"` so the user's session is not blocked.

## Typical Workflows

**User asks: "Screenshot my dashboard every morning at 8"**
```
craig_schedule_add:
  task: morning_dashboard
  cron: "0 8 * * *"
  prompt: "Operator: Take a screenshot of https://grafana.mycompany.com/d/main"
```

**User asks: "Run a health check in 5 minutes"**
Calculate the target time (current local time + 5 minutes), use `once:`:
```
craig_schedule_add:
  task: quick_health_check
  cron: "once:2026-04-05T13:50"
  prompt: "Operator: Check health of https://staging.myapp.com/health"
```

**User asks: "Generate a weekly recap every Friday"**
```
craig_schedule_add:
  task: weekly_recap
  cron: "0 17 * * 5"
  prompt: "Operator: Generate a weekly recap of Guardian findings"
```

## After Scheduling

Always verify with `craig_status` to confirm the task is registered. Enable Craig if not already active with `craig_enable`.
