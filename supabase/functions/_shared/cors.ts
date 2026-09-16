// Shared CORS headers for Edge Functions called directly from the web client
// (supabase.functions.invoke). Native app requests aren't subject to CORS,
// but the browser sends a preflight OPTIONS request that must be answered
// with these headers or the actual request never fires.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCorsPreflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { headers: corsHeaders }) : null;
}
