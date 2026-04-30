/**
 * Lemon Squeezy payment webhook — Supabase Edge Function.
 *
 * On every successful order it:
 *   1. Verifies the HMAC-SHA256 signature using LEMON_SQUEEZY_WEBHOOK_SECRET
 *   2. Upserts the buyer's email into paid_emails
 *   3. Updates profiles.is_premium = true if the user already has an account
 *
 * Secrets to set in Supabase Dashboard → Project Settings → Edge Functions:
 *   LEMON_SQUEEZY_WEBHOOK_SECRET  (from LS Dashboard → Webhooks → secret)
 *   SUPABASE_SERVICE_ROLE_KEY     (auto-available in Edge Functions)
 *   SUPABASE_URL                  (auto-available in Edge Functions)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-requested-with, content-type, x-signature',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body      = await req.text()
    const signature = req.headers.get('x-signature') ?? ''
    const secret    = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET') ?? ''

    // ── 1. Verify signature ──────────────────────────────────────────────────
    if (secret) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const mac     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
      const hexMac  = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
      if (hexMac !== signature) {
        console.error('Webhook signature mismatch')
        return new Response('Unauthorized', { status: 401, headers: corsHeaders })
      }
    } else {
      console.warn('LEMON_SQUEEZY_WEBHOOK_SECRET not set — skipping signature check')
    }

    // ── 2. Parse event ───────────────────────────────────────────────────────
    const event     = JSON.parse(body)
    const eventName = event?.meta?.event_name as string | undefined
    const attrs     = event?.data?.attributes

    console.log(`Lemon webhook: ${eventName}`)

    // Only act on paid orders
    if (eventName !== 'order_created' || attrs?.status !== 'paid') {
      return new Response('ignored', { status: 200, headers: corsHeaders })
    }

    const email     = (attrs?.user_email as string | undefined)?.toLowerCase().trim()
    const orderId   = String(event?.data?.id ?? '')
    const productId = String(attrs?.first_order_item?.product_id ?? '')

    if (!email) {
      return new Response('missing email', { status: 400, headers: corsHeaders })
    }

    console.log(`Processing paid order for: ${email}`)

    // ── 3. Update database ───────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Record the payment (upsert handles duplicate webhook deliveries)
    const { error: insertErr } = await supabase
      .from('paid_emails')
      .upsert({ email, order_id: orderId, product_id: productId, paid_at: new Date().toISOString() })
    if (insertErr) console.error('paid_emails upsert error:', insertErr.message)

    // Upgrade the profile if the user already has an account
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ is_premium: true, premium_since: new Date().toISOString() })
      .eq('email', email)
    if (updateErr) console.error('profiles update error:', updateErr.message)

    console.log(`Premium granted to ${email}`)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response('Internal error', { status: 500, headers: corsHeaders })
  }
})
