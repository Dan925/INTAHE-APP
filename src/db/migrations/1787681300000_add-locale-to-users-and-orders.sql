-- Up Migration

-- The web frontend and mobile app have both been bilingual (FR/EN) from
-- the start, but the language a person is actually using was never sent
-- to the backend — every transactional email (order confirmation,
-- password reset, refund) went out English-only regardless of which
-- language the buyer/user was browsing in. These two columns are the
-- missing signal: the client already knows its own active locale (see
-- lib/i18n on both platforms), it just needs to say so.
--
-- Defaulting to 'en' rather than guessing from IP/Accept-Language: a wrong
-- guess is worse than a plain default, and every existing row predates
-- this column so there's no real preference to recover for them anyway.
ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'en';
ALTER TABLE users ADD CONSTRAINT users_locale_check CHECK (locale IN ('fr', 'en'));

-- Snapshotted onto the order at checkout time (not read live off `users`
-- at send time) so a buyer who switches their app's language later, or a
-- guest checkout with no user account at all, still gets the confirmation
-- email in the language they actually bought the ticket in.
ALTER TABLE orders ADD COLUMN buyer_locale text NOT NULL DEFAULT 'en';
ALTER TABLE orders ADD CONSTRAINT orders_buyer_locale_check CHECK (buyer_locale IN ('fr', 'en'));

-- Down Migration

ALTER TABLE orders DROP CONSTRAINT orders_buyer_locale_check;
ALTER TABLE orders DROP COLUMN buyer_locale;
ALTER TABLE users DROP CONSTRAINT users_locale_check;
ALTER TABLE users DROP COLUMN locale;
