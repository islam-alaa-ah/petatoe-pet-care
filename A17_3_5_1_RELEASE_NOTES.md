# A17.3.5.1 — Approved appointment slots

- The heatmap now displays only confirmed slot hours 12:00, 14:00, 16:00, 18:00, 20:00, 22:00, validated against the Oct 20 application source `installation-scheduling.js` and `installations-service.js`.
- Hourly counts are read from scheduled_time and dated scheduledDate. Slots outside this set are counted separately and not silently discarded or assigned to an allowed slot.
- Unknown/malformed times remain in their own KPI. Each source request can be counted once only.
- Totals in the chart reflect plotted appointments, not all appointments if there are out-of-slot/unknown records.
- No database changes. No change to appointments scheduling code, permissions, or financial logic.
- Review live outcome before certification; source time settings might evolve in future and must be revisited if the booking-slot policy changes.
