-- Phase M14.9.3 verification
select to_regprocedure('public.can_access_installation_request_scope(uuid,uuid)') as canonical_scope_function;

select tablename, policyname, cmd,
       (qual ilike '%can_access_installation_request_scope%' or with_check ilike '%can_access_installation_request_scope%') as uses_canonical_scope
from pg_policies
where schemaname='public'
  and tablename in (
    'installation_requests','installation_request_services','installation_execution_files',
    'installation_status_history','installation_completion_reports','installation_completion_files',
    'installation_revisits','customers','quotations'
  )
  and policyname in (
    'installation requests scoped select','installation requests scoped insert','installation requests scoped update','installation requests scoped delete',
    'installation request services scoped select','installation request services scoped insert','installation request services scoped update','installation request services scoped delete',
    'installation execution files view','installation execution files add','installation execution history view',
    'installation completion scoped select','installation completion scoped insert','installation completion scoped update',
    'installation files scoped select','installation files scoped insert','installation_revisits_select','installation_revisits_write',
    'installation linked customers read','installation linked quotations read'
  )
order by tablename,policyname;

-- Must return zero rows: no canonical installation policy may omit the combined scope,
-- except request insert which intentionally requires an unassigned team plus representative scope.
select tablename,policyname
from pg_policies
where schemaname='public'
  and policyname in (
    'installation requests scoped select','installation requests scoped update','installation requests scoped delete',
    'installation request services scoped select','installation request services scoped insert','installation request services scoped update','installation request services scoped delete',
    'installation execution files view','installation execution files add','installation execution history view',
    'installation completion scoped select','installation completion scoped insert','installation completion scoped update',
    'installation files scoped select','installation files scoped insert','installation_revisits_select','installation_revisits_write',
    'installation linked customers read','installation linked quotations read'
  )
  and coalesce(qual,'') not ilike '%can_access_installation_request_scope%'
  and coalesce(with_check,'') not ilike '%can_access_installation_request_scope%';
