
insert into public.interest_categories (name)
values
  ('أجهزة منزلية'),
  ('مكيفات'),
  ('ثلاجات لحوم'),
  ('ثلاجات دواجن'),
  ('ثلاجات خضار'),
  ('ثلاجات عصائر'),
  ('تبريد')
on conflict (name) do nothing;

insert into public.no_sale_reasons (name)
values
  ('لم يتم التواصل بعد'),
  ('السعر مرتفع'),
  ('اختار منافسًا آخر'),
  ('لا توجد ميزانية حاليًا'),
  ('القرار مؤجل'),
  ('مدة التوريد'),
  ('شروط الدفع'),
  ('لم يتم الرد'),
  ('أخرى')
on conflict (name) do nothing;

insert into public.sales_representatives (representative_code, full_name, phone, email)
values
  ('REP-001', 'أحمد محمد', '0500000001', 'ahmed@company.com'),
  ('REP-002', 'محمد علي', '0500000002', 'mohamed@company.com'),
  ('REP-003', 'خالد حسن', '0500000003', 'khaled@company.com')
on conflict (representative_code) do nothing;
