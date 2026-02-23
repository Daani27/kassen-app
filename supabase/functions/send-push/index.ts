/**
 * Supabase Edge Function: Web-Push an alle Abonnenten senden.
 * Wird vom Frontend mit JWT aufgerufen; nur eingeloggte User (idealerweise Admins) dürfen senden.
 *
 * Secrets in Supabase setzen:
 *   VAPID_PUBLIC_KEY  – öffentlicher VAPID-Key (Base64-URL)
 *   VAPID_PRIVATE_KEY – privater VAPID-Key (Base64-URL, z. B. mit npx web-push generate-vapid-keys)
 *   VAPID_SUBJECT     – optional; mailto-Kontakt für VAPID-JWT (z. B. mailto:admin@example.com).
 *                       Ohne Setzen: mailto:noreply@example.com. Für Apple/Safari muss ein gültiges
 *                       mailto ohne localhost verwendet werden, sonst 403 BadJwtToken.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
const rawSubject = (Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@example.com').trim().replace(/^mailto:\s+/, 'mailto:')
const vapidSubject = /^mailto:.+@.+\..+/.test(rawSubject) ? rawSubject : 'mailto:noreply@example.com'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(vapidSubject, VAPID_PUBLIC, VAPID_PRIVATE)
}
if (rawSubject !== vapidSubject) {
  console.warn('Push: VAPID_SUBJECT hat ungültiges Format (z. B. keine mailto: oder Domain ohne Punkt), verwende Fallback. Erwartet: mailto:deine-email@domain.de')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'Push not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { title?: string; body?: string; access_token?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // User-JWT aus Body prüfen (Frontend sendet Anon-Key im Header, um 401 am Gateway zu vermeiden)
  const accessToken = body.access_token
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'access_token required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken)
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid JWT', message: userError?.message || 'Invalid JWT' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Nur Admins dürfen Push an alle senden (verhindert Spam durch normale User)
  const { data: profile } = await supabaseAuth.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Forbidden', message: 'Nur Admins können Push senden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const title = (body.title || 'Kassen App').slice(0, 100)
  const payload = JSON.stringify({ title, body: (body.body || '').slice(0, 500) })

  const { data: subs, error } = await supabaseAuth
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')

  if (error) {
    console.error('push_subscriptions select error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const hasAppleEndpoint = (subs || []).some((r: { endpoint?: string }) => (r.endpoint || '').includes('web.push.apple.com'))
  const maskedSubject = vapidSubject.includes('@') ? vapidSubject.replace(/^mailto:(.+)$/, 'mailto:***@***') : vapidSubject
  const publicKeyPrefix = (VAPID_PUBLIC || '').slice(0, 24)
  if (hasAppleEndpoint) {
    console.warn('Push (Apple) Diagnose: VAPID subject =', maskedSubject, '| VAPID_PUBLIC_KEY Präfix =', publicKeyPrefix, '... (muss = VITE_VAPID_PUBLIC_KEY in .env)')
  }
  const isAppleDefaultSubject = vapidSubject === 'mailto:noreply@example.com'
  if (hasAppleEndpoint && isAppleDefaultSubject) {
    console.warn('Push: Apple-Endpoint, aber VAPID_SUBJECT ist Fallback. In Supabase Secrets setzen: VAPID_SUBJECT=mailto:deine-email@domain.de (sonst 403 BadJwtToken)')
  }

  const results: { ok: number; failed: number } = { ok: 0, failed: 0 }
  let appleBadJwtSeen = false
  const options = { TTL: 86400 }
  for (const row of subs || []) {
    try {
      await webPush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
        options
      )
      results.ok += 1
    } catch (e) {
      results.failed += 1
      const msg = e instanceof Error ? e.message : String(e)
      const body = (e as { body?: string })?.body ?? ''
      if ((row.endpoint || '').includes('web.push.apple.com') && (msg.includes('403') || String(body).includes('BadJwtToken'))) {
        appleBadJwtSeen = true
        console.warn('Push 403 BadJwtToken (Apple). Aktuell: subject =', maskedSubject, '| VAPID_PUBLIC_KEY Präfix =', publicKeyPrefix)
      }
      console.warn('Push failed:', row.endpoint?.slice(0, 80), msg)
    }
  }

  const responsePayload: { sent: number; failed: number; hint?: string; vapid_debug?: { subject: string; publicKeyPrefix: string } } = { sent: results.ok, failed: results.failed }
  if (appleBadJwtSeen) {
    responsePayload.hint = '403 BadJwtToken (iOS): 1) VAPID_SUBJECT in Supabase Secrets = mailto:deine-email@domain.de (kein localhost). 2) Dasselbe Key-Paar wie in der App: VAPID_PUBLIC_KEY in Supabase muss exakt VITE_VAPID_PUBLIC_KEY aus der .env sein (Keys nur einmal erzeugen). Wenn Keys geändert wurden: Push in Einstellungen deaktivieren, dann wieder aktivieren (neues Abo mit richtigem Key).'
    responsePayload.vapid_debug = { subject: maskedSubject, publicKeyPrefix: publicKeyPrefix + '...' }
  }

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
