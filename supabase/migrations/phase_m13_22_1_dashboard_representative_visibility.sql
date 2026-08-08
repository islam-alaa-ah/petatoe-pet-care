-- KYUM Phase M13.22.1
-- Dashboard representative visibility integration.

alter table public.daily_employee_report_settings
  add column if not exists include_in_dashboard_performance boolean not null default true;

comment on column public.daily_employee_report_settings.include_in_dashboard_performance
  is 'Controls whether the linked representative appears in dashboard performance cards and dashboard totals.';

analyze public.daily_employee_report_settings;
