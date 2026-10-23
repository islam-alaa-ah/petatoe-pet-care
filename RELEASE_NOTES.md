# A17.3.8.1 — Operational request status and calendar-window correction

- The current month is included in full for scheduled workloads; future months remain excluded from a current-year overview. Ongoing months are still marked partial, so no final growth conclusion is presented.
- Completed, assigned (مسند), and cancelled request counts are now separate in KPI and group/month detail tables.
- Undated requests are still counted separately and never assigned an invented month.
- The existing A15 operationalReport() is left intact; no DB/RPC/RLS changes.
- Existing A17 frontend translations remain centralized; one opsAssigned key added to both locales.
- This addresses an apparent date-cap exclusion; the seven assigned October dates must be verified live before claiming exact reconciliation.
- Installation: overlay the two files on the latest deployed A17.3.7+ baseline.
- Test: source Q2 = 434 records, 433 dated, October 118 (111 completed + 7 assigned) if the seven assigned requests fall on or before October 31. Also check VAN A/B and unassigned groups, each status and mobile layout.
- Static validation is not live certification.
