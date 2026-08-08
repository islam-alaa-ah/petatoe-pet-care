# Phase 17.4-C1 — Customer Reference Center

## Implemented

- Added a new `العملاء` tab inside `البيانات المرجعية`.
- Added customer search by:
  - customer name
  - mobile number
  - contact person
  - quotation number
  - representative
- Added filters for:
  - customer type
  - interest category
  - sales representative
- Added paginated customer table.
- Added customer actions:
  - open customer details
  - edit customer
  - delete customer
  - add new customer
- Reused the existing Customers Service and dialogs.
- Reused the existing customer permission engine:
  - view
  - add
  - edit
  - delete
- Added responsive styling.
- Added cache-busting versions for `style.css` and `app.js`.

## Modified Files Only

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `PHASE17.4-C1_VERIFICATION.md`

## Verification

1. Open `البيانات المرجعية`.
2. Select `العملاء`.
3. Confirm the customer table loads.
4. Test search and all three filters.
5. Test pagination.
6. Test `فتح`, `تعديل`, and `إضافة عميل`.
7. Confirm unauthorized actions remain hidden.
8. Confirm the original `العملاء` screen still works unchanged.

## Scope

Excel export, template download, and Excel import are not included in C1.
They are scheduled for Phase 17.4-C2 and C3.
