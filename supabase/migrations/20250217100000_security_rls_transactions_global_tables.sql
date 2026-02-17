-- Security-Fix: Transaktionen-INSERT einschränken + RLS für global_expenses, app_settings, fruehstueck_orders, products
-- Voraussetzung: Migration 20250216000000 (is_admin()) und 20250217000000 (profiles trigger) sind angewendet.

-- ========== 1. TRANSACTIONS: INSERT nur für eigene user_id oder Admin ==========
DROP POLICY IF EXISTS "transactions_insert_authenticated" ON public.transactions;
CREATE POLICY "transactions_insert_own_or_admin"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ========== 2. GLOBAL_EXPENSES: Lesen für alle eingeloggt, Schreiben nur Admin ==========
ALTER TABLE public.global_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_expenses_select_authenticated"
  ON public.global_expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "global_expenses_insert_admin"
  ON public.global_expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "global_expenses_update_admin"
  ON public.global_expenses FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "global_expenses_delete_admin"
  ON public.global_expenses FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ========== 3. APP_SETTINGS: Lesen für alle (Login braucht es unauthenticated!), Schreiben nur Admin ==========
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select_all"
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "app_settings_update_admin"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "app_settings_insert_admin"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "app_settings_delete_admin"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ========== 4. FRUEHSTUECK_ORDERS: Eigenes oder Admin ==========
ALTER TABLE public.fruehstueck_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fruehstueck_orders_select_own_or_admin"
  ON public.fruehstueck_orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "fruehstueck_orders_insert_own_or_admin"
  ON public.fruehstueck_orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "fruehstueck_orders_update_own_or_admin"
  ON public.fruehstueck_orders FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "fruehstueck_orders_delete_own_or_admin"
  ON public.fruehstueck_orders FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ========== 5. PRODUCTS: Lesen für eingeloggt, Schreiben nur Admin ==========
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_authenticated"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products_insert_admin"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "products_update_admin"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "products_delete_admin"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin());
