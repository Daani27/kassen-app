-- Push-Abonnements für Web-Push (Ersatz für Telegram).
-- RLS: Jeder User darf nur eigene Zeilen lesen/schreiben.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User darf nur eigene Subscriptions sehen und verwalten
CREATE POLICY "Users manage own push subscription"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Edge Function / Service Role braucht Lesezugriff auf alle (für Versand).
-- Dafür wird in der Edge Function der Service-Role-Key verwendet, der RLS umgeht.
-- Kein weiteres Policy nötig für Backend.

COMMENT ON TABLE public.push_subscriptions IS 'Web-Push-Abonnements pro User für Kassen App';
