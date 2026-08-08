-- Phase M14.9.8.15.4.1 verification

-- Must return true: the canonical update RPC is SECURITY DEFINER.
select p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='update_installation_request_with_services'
  and pg_get_function_identity_arguments(p.oid) =
      'p_request_id uuid, p_customer_id uuid, p_quotation_id uuid, p_representative_id uuid, p_neighborhood_id uuid, p_priority text, p_installation_address text, p_customer_order_number text, p_customer_map_url text, p_notes text, p_services jsonb';

-- Must return one row and include the explicit request-scope guard.
select position('can_access_installation_request_scope' in pg_get_functiondef(p.oid)) > 0 as has_scope_guard,
       position('can_access_installation_representative' in pg_get_functiondef(p.oid)) > 0 as has_representative_guard
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='update_installation_request_with_services'
  and pg_get_function_identity_arguments(p.oid) =
      'p_request_id uuid, p_customer_id uuid, p_quotation_id uuid, p_representative_id uuid, p_neighborhood_id uuid, p_priority text, p_installation_address text, p_customer_order_number text, p_customer_map_url text, p_notes text, p_services jsonb';

-- Must return false: authenticated still has no direct DML privilege on the protected table.
select has_table_privilege('authenticated','public.installation_execution_visit_services','INSERT,UPDATE,DELETE') as authenticated_has_direct_write;
