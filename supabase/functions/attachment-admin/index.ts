import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';
import { createHandler, assertVersionBoundSignedUrl, isDefinitiveStorageRejection } from './core.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Never store this key in GitHub or browser configuration.
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) }
});
const origins = (Deno.env.get('AM1_ALLOWED_ORIGINS') || 'https://islam-alaa-ah.github.io,capacitor://localhost,http://localhost,https://localhost').split(',').map(s => s.trim()).filter(Boolean);
Deno.serve(createHandler({
  origins,
  authenticate: async (token: string) => {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return null;
    return data.user;
  },
  rpc: async (actor: string, action: string, input: unknown) => {
    const { data, error } = await admin.rpc('petatoe_attachment_admin_am1', { p_actor: actor, p_action: action, p_input: input });
    if (error) throw error;
    return data;
  },
  sign: async (bucket: string, path: string, seconds: number, versionId: string) => {
    if (!versionId) throw new Error('AM1_VERSION_READ_UNSUPPORTED');
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, seconds, { versionId });
    if (error || !data?.signedUrl) throw new Error('AM1_IMAGE_UNAVAILABLE');
    // Reject older deployments that ignore versionId. No bare-path fallback.
    return assertVersionBoundSignedUrl(data.signedUrl, url, bucket, path, versionId);
  },
  remove: async (bucket: string, path: string, versionId: string) => {
    if (!versionId) throw Object.assign(new Error('AM1_VERSION_DELETE_UNSUPPORTED'), {definite:true});
    const { error } = await admin.storage.from(bucket).remove([{ path, versionId }]);
    if (error) {
      const failure = Object.assign(new Error('AM1_STORAGE_DELETE_FAILED'), {
        definite: isDefinitiveStorageRejection(error)
      });
      throw failure;
    }
  }
}));
