-- Trigger anpassen: Preis-Prüfung nur für category = 'snack' (Strichliste/Produkte).
-- Frühstück, Zahlungen, Mahlzeiten etc. haben eigene Logik und keine Einträge in products.

CREATE OR REPLACE FUNCTION verify_transaction_price()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur bei Strichliste (snack) gegen products prüfen; andere Kategorien durchlassen
  IF NEW.category IS DISTINCT FROM 'snack' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products
    WHERE LOWER(name) = LOWER(NEW.description)
    AND ROUND(ABS(price)::numeric, 2) = ROUND(ABS(NEW.amount)::numeric, 2)
  ) THEN
    RAISE EXCEPTION 'Sicherheits-Stopp: Preis-Abweichung! Produkt: % (Gesendet: %, Erwartet: %)',
      NEW.description,
      ABS(NEW.amount),
      (SELECT price FROM products WHERE LOWER(name) = LOWER(NEW.description) LIMIT 1);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger nur anlegen, wenn er noch nicht existiert (idempotent)
DROP TRIGGER IF EXISTS tr_verify_price ON public.transactions;
CREATE TRIGGER tr_verify_price
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION verify_transaction_price();
