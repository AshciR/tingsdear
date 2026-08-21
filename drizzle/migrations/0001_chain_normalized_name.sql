-- ============================================================
-- Chain name normalization
-- One physical chain reaches us under several spellings — "Super Valu Fresh Foods",
-- "Super Valu Home Centre", "SUPER VALU" — and matching on the raw name mints a row for
-- each. Store the reduced form alongside the user's text and match on that.
-- ============================================================

-- Mirrors normalizeChainName() in src/lib/server/location-resolver.ts. The two are pinned
-- together by a test in location-resolver.test.ts; change them in the same commit.
CREATE OR REPLACE FUNCTION normalize_chain_name(raw TEXT)
RETURNS TEXT AS $$
DECLARE
    base     TEXT;
    stripped TEXT;
BEGIN
    base := btrim(regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g'));
    stripped := btrim(regexp_replace(
        base,
        '( (supermarkets?|super market|food stores?|fresh foods?|home cent(re|er)|wholesalers?|ltd|limited|inc))+$',
        ''
    ));
    -- A chain genuinely called "Supermarket" must not normalize away to nothing.
    RETURN COALESCE(NULLIF(stripped, ''), base);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generated, not written by the application: a chain row cannot be inserted with a stale or
-- missing normalized form, and existing rows are backfilled by ADD COLUMN itself.
ALTER TABLE supermarket_chain
    ADD COLUMN normalized_name VARCHAR(255)
    GENERATED ALWAYS AS (normalize_chain_name(name)::VARCHAR(255)) STORED NOT NULL;

-- Deliberately unique: this constraint is the guarantee that two spellings cannot become two
-- chains. If existing rows collide, this migration fails — merging them is a data decision and
-- belongs in a deliberate migration of its own, not in an ON CONFLICT clause here.
CREATE UNIQUE INDEX idx_chain_normalized_name ON supermarket_chain (normalized_name);
