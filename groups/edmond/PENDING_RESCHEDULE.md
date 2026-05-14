# Pending: reschedule recurring tasks

MCP tools were disconnected when this was attempted. Reschedule as soon as tools reconnect.
Target channel: telegram_finance, platform_id: 8641420749

## 1. bank-export-watch
- cron: `0 7 * * *` (daily 07:00)
- Check `/workspace/extra/bank-exports/` for new ActivoBank Excel files
- Parse and categorise if found, silent if nothing
- Use script: `{ wakeAgent: fileCount > 0 }`

## 2. month-end-salary-reminder
- cron: `0 9 28 * * *` (28th of each month at 09:00)
- Message Clément to confirm Branca salary processed
- Flag pending SS payments or invoices
- Summarise month financial position
