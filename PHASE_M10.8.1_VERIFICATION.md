# Phase M10.8.1 — Safe Import Validation & Existing Data Detection

- Error rows are excluded from the import payload.
- Rows previously uploaded with the same customer/request/quotation identity are detected before import.
- Previously uploaded rows are labeled and excluded.
- The dialog shows the exact counts that will be imported, ignored for errors, and skipped as previously uploaded.
- A confirmation step is required before execution.
- No SQL or RLS changes were made.
