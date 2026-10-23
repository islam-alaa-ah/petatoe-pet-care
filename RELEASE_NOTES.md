# A17 global comparison year-over-year correction

- Main A17 comparison is locked to the same calendar month in the previous year (YoY), e.g. Jan 2026 ↔ Jan 2025.
- Replaced the misleading global “previous period” option with an explicit YoY option.
- Sales trends and detail table use shift(month,-12) for every row, including year rollover.
- Global operations/services already use the shared comparator and therefore take the YoY branch.
- Service finance-specific MoM/YoY/previous-period selector remains unchanged.
- A14 customer reporting selector remains unchanged.
- No financial source, arithmetic, SQL, RPC, RLS or stored data changed.
- Partial-month completion logic is unchanged.
- Static/code checks only; live browser reconciliation pending.
