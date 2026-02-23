-- Nutzer dürfen eigene Frühstücks-Transaktionen von heute löschen;
-- Admins dürfen zusätzlich Frühstücks-Transaktionen anderer Nutzer (heute) löschen.
-- Verhindert Mehrfachbuchungen bei Brötchen: alte löschen, eine neue anlegen.
-- Ohne diese Policy trifft der Delete für normale User 0 Zeilen (nur Admins durften löschen).
CREATE POLICY "transactions_delete_own_breakfast_today"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (
    category = 'breakfast'
    AND (created_at AT TIME ZONE 'UTC')::date = (current_timestamp AT TIME ZONE 'UTC')::date
    AND (user_id = auth.uid() OR public.is_admin())
  );
