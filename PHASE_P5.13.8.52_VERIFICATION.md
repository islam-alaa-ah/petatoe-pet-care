# P5.13.8.52 Verification

Scope: invoice conversion modal only.

- Canonical value source: `get_installation_execution_group_invoice_financials().final_amount_including_tax`.
- Display: rounded to the nearest whole SAR; no decimal fraction.
- Persistence contract: `sales_invoices.invoice_amount` remains the existing pre-VAT base; no schema/RPC write contract changed.
- Invoice date default remains scheduled appointment date and remains editable.
- SQL required: No.
