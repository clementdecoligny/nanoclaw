## Task scheduling (`schedule_task`)

For any recurring task, use `schedule_task`. This is the scheduling path — tasks persist across sessions and restarts, and support the pre-task `script` hook described below.

To inspect or change existing tasks, use `list_tasks` (returns one row per series with the stable id) and `update_task` / `cancel_task` / `pause_task` / `resume_task`. Prefer `update_task` over cancel + reschedule.

### Computing `processAfter` for day-of-week tasks

When scheduling a task that targets a specific day of the week (e.g. `0 8 * * 1` = every Monday), **do not compute the next occurrence by mental arithmetic**. Use a bash one-liner to derive it:

```bash
# Example: next Monday at 08:00 local time
python3 -c "
from datetime import date, timedelta
today = date.today()
days_ahead = (0 - today.weekday()) % 7  # 0=Monday
if days_ahead == 0: days_ahead = 7      # already today → next week
d = today + timedelta(days=days_ahead)
print(f'{d}T08:00:00')
"
```

Run this first and use the printed date as `processAfter`. This avoids off-by-one errors that cause a Monday task to fire on Tuesday.

Frequent recurring scheduled tasks — more than a few times a day — consume API credits and can risk account restrictions. You can add a `script` that runs first, and you will only be called when the check passes.

### How it works

1. Provide a bash `script` alongside the `prompt` when scheduling
2. When the task fires, the script runs first
3. Script returns: `{ "wakeAgent": true/false, "data": {...} }`
4. If `wakeAgent: false` — nothing happens, task waits for next run
5. If `wakeAgent: true` — claude receives the script's data + prompt and handles

### Always test your script first

Before scheduling, run the script directly to verify it works:

```bash
bash -c 'node --input-type=module -e "
  const r = await fetch(\"https://api.github.com/repos/owner/repo/pulls?state=open\");
  const prs = await r.json();
  console.log(JSON.stringify({ wakeAgent: prs.length > 0, data: prs.slice(0, 5) }));
"'
```

### HEARTBEAT.md tasks — update `last_run` immediately

If your task was defined in `HEARTBEAT.md` (it has a `schedule:` and `last_run:` field), you **must** update `last_run` to the actual current UTC time at the start of every run, before doing any work. Use the system clock — never compute it by hand:

```bash
date -u +"%Y-%m-%dT%H:%M:%S.000Z"
```

Write the printed value into the `last_run:` field for the matching task in `HEARTBEAT.md`. If you skip this step, the next run will see a stale `last_run` and may generate content for the wrong day.

### When NOT to use scripts

If a task requires your judgment every time (daily briefings, reminders, reports), skip the script — just use a regular prompt. Do not attempt to do things like sentiment analysis or advanced nlp in scripts.

### Frequent task guidance

If a user wants a task to run more than a few times a day and a script can't be used:

- Explain that each time the task fires it uses API credits and risks rate limits
- Suggest adjusting the task requirements in a way that will allow you to use a script
- If the user needs an LLM to evaluate data, suggest using an API key with direct Anthropic API calls inside the script
- Help the user find the minimum viable frequency
