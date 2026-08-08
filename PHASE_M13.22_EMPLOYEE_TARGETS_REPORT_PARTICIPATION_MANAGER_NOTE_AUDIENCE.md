# Phase M13.22 — Employee Targets, Report Participation & Manager Note Audience

## Scope

- Per-employee daily targets with an effective date.
- Control participation in daily performance reports and employee timeline reports.
- Control whether each employee is required to complete the daily checklist.
- Control whether each employee is subject to customer, follow-up and quotation targets.
- Manager-note audience controls: all users, report participants, or selected users.

## Database setup

Run:

`supabase/migrations/phase_m13_22_employee_targets_report_participation_manager_note_audience.sql`

before using the new settings screen.

## Permissions

Only users with `dailyOperationsSettings.edit` can manage employee settings or edit the manager note. Reading remains available according to the existing screen permissions and the manager-note audience policy.

## Behavioral notes

- Employees excluded from daily reports are removed from daily performance rows, ranking, KPIs, detailed task report filters and CSV output.
- Employees excluded from timeline reports are removed from timeline employee choices and attendance/timeline rows.
- Employees not subject to targets do not count in target-achievement denominators.
- Employees not subject to daily tasks see a clear "not required" state in Daily Operations.
- The effective date preserves historical target/report participation settings.
- Manager notes remain one note per work date; a later authorized edit replaces that date's note.
