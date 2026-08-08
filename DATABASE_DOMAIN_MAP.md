# Database Domain Map

## Identity & Security

- `auth.users`
- `user_profiles`
- `audit_logs`

## Reference Data

- `sales_representatives`
- `interest_categories`
- `no_sale_reasons`

## Customer Domain

- `customers`
- `customer_interests`
- `customer_contacts`

رقم الجوال هو المرجع الظاهر للمستخدم، إجباري وفريد ويُوحّد قبل المقارنة.

## CRM Activity

- `customer_followups`
- `crm_tasks`
- `crm_attachments`

## Sales

- `quotations`
- `sales_orders`
- `invoices`
- `collections`

## Projects & Contracts

- `customer_projects`
- `customer_contracts`

## After-Sales

- `installed_assets`
- `service_requests`
- `customer_complaints`

## العلاقات الأساسية

```text
customers
├── customer_interests
├── customer_contacts
├── customer_followups
├── quotations
│   └── sales_orders
│       └── invoices
│           └── collections
├── customer_projects
│   └── customer_contracts
├── installed_assets
│   └── service_requests
└── customer_complaints
```
