# DeepOcean — Auth & Payments Setup

## 1. Environment variables

Copy `.env.example` to `.env` and fill in the values.

The Supabase keys are already set. You only need to add the Lemon Squeezy checkout URL once you create a product.

```
VITE_SUPABASE_URL=https://kkrvogzganeoxxpgngdf.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_fVnaA2kzH0r13CV-KOtq9w_ULGlTUlz
VITE_LEMON_SQUEEZY_CHECKOUT_URL=https://your-store.lemonsqueezy.com/buy/...
```

---

## 2. Supabase — one-time dashboard steps

### 2a. Enable Google OAuth (for "Continue with Google")

1. Go to [Authentication → Providers → Google](https://supabase.com/dashboard/project/kkrvogzganeoxxpgngdf/auth/providers)
2. Enable Google
3. Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application)
4. Add `https://kkrvogzganeoxxpgngdf.supabase.co/auth/v1/callback` as an authorised redirect URI
5. Paste the Client ID and Secret back into Supabase

### 2b. Add the deep-link redirect URL

1. Go to [Authentication → URL Configuration](https://supabase.com/dashboard/project/kkrvogzganeoxxpgngdf/auth/url-configuration)
2. Under **Redirect URLs**, add: `deepocean://auth/callback`

This allows Supabase to redirect back to the Electron app after login.

### 2c. Set the webhook Edge Function secret

1. Go to [Project Settings → Edge Functions](https://supabase.com/dashboard/project/kkrvogzganeoxxpgngdf/settings/functions)
2. Add secret: `LEMON_SQUEEZY_WEBHOOK_SECRET` = *(your webhook signing secret from Lemon Squeezy)*

The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets are injected automatically.

---

## 3. Lemon Squeezy — one-time setup

1. Create an account at [lemonsqueezy.com](https://www.lemonsqueezy.com)
2. Create a Store → Create a Product (subscription or one-time, your choice)
3. Copy the checkout URL → paste as `VITE_LEMON_SQUEEZY_CHECKOUT_URL` in `.env`
4. Go to Store Settings → Webhooks → Add endpoint:
   - URL: `https://kkrvogzganeoxxpgngdf.supabase.co/functions/v1/lemon-webhook`
   - Events to subscribe: `order_created`
   - Copy the signing secret → set as `LEMON_SQUEEZY_WEBHOOK_SECRET` in Supabase (step 2c above)

---

## 4. How it all works

```
User clicks "Upgrade to Premium"
  → window.api.openExternal(VITE_LEMON_SQUEEZY_CHECKOUT_URL)
  → Browser opens Lemon Squeezy checkout
  → User pays
  → Lemon Squeezy fires webhook → lemon-webhook Edge Function
  → Edge Function upserts paid_emails + sets profiles.is_premium = true
  → Next time user opens app / session refreshes → isPremium = true → gates lift
```

```
User clicks "Sign in with Google"
  → supabase.auth.signInWithOAuth({ redirectTo: 'deepocean://auth/callback' })
  → Browser opens Google sign-in
  → Supabase redirects to deepocean://auth/callback?code=...
  → Windows fires Electron second-instance event with that URL
  → Main process → IPC → renderer calls exchangeCodeForSession(url)
  → User is now signed in
```

---

## 5. Database schema (already applied)

Tables created by `supabase/migrations/20260430000000_initial_schema.sql`:

| Table | Purpose |
|---|---|
| `profiles` | One row per user — stores `is_premium`, auto-created on signup |
| `paid_emails` | Written by webhook on purchase — used to grant premium to users who paid before signing up |

---

## 6. Premium features

| Feature | Free | Premium |
|---|---|---|
| Folder / App blocking | ✅ | ✅ |
| Unlimited rules & gateways | ✅ | ✅ |
| Server-time schedules (anti-bypass) | ❌ | ✅ |
| Settings lock with gateway | ❌ | ✅ |
