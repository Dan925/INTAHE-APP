-- Up Migration

-- Intahe's organizers are overwhelmingly Canadian — cad is now the
-- platform-wide default price currency (see also ticket_types, which
-- already defaults to cad at the application layer). The service layer
-- always passes an explicit currency on insert, so this default is really
-- only a safety net for any future direct insert.
ALTER TABLE quick_sale_items ALTER COLUMN currency SET DEFAULT 'cad';

-- Down Migration

ALTER TABLE quick_sale_items ALTER COLUMN currency SET DEFAULT 'usd';
