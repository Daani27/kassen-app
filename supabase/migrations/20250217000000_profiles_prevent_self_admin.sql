-- Security-Fix: Verhindern, dass sich Nutzer per UPDATE selbst is_admin setzen können.
-- RLS prüft nur Zeilenidentität; ein BEFORE UPDATE Trigger erzwingt: is_admin darf nur von Admins geändert werden.

CREATE OR REPLACE FUNCTION public.profiles_prevent_non_admin_is_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nur prüfen, wenn ein eingeloggter User (JWT) die Änderung macht.
  -- Dashboard / Service-Role / SQL Editor: auth.uid() IS NULL → Änderung erlauben.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_prevent_non_admin_is_admin_change() IS 'Trigger: Nur Admins dürfen is_admin auf profiles ändern; sonst bleibt der alte Wert.';

DROP TRIGGER IF EXISTS profiles_prevent_self_admin_trigger ON public.profiles;
CREATE TRIGGER profiles_prevent_self_admin_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_prevent_non_admin_is_admin_change();
