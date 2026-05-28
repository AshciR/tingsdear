-- ============================================================
-- Things Dear Data — Complete Schema
-- PostgreSQL + PostGIS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ------------------------------------------------------------
-- Reference tables
-- ------------------------------------------------------------

CREATE TABLE manufacturer (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    created    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE category (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL UNIQUE,
    parent_id  BIGINT       REFERENCES category(id),
    created    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_category_parent ON category (parent_id);

-- ------------------------------------------------------------
-- Supermarket chain + locations
-- ------------------------------------------------------------

CREATE TABLE supermarket_chain (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL UNIQUE,
    created    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE supermarket_location (
    id           BIGSERIAL PRIMARY KEY,
    chain_id     BIGINT       NOT NULL REFERENCES supermarket_chain(id),
    name         VARCHAR(255),
    address      VARCHAR(500),
    city         VARCHAR(255),
    region       VARCHAR(255),
    postal_code  VARCHAR(32),
    country      VARCHAR(64),
    latitude     DECIMAL(9, 6),
    longitude    DECIMAL(9, 6),
    geog         GEOGRAPHY(Point, 4326),
    created      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_location_chain ON supermarket_location (chain_id);
CREATE INDEX idx_location_geog  ON supermarket_location USING GIST (geog);

CREATE OR REPLACE FUNCTION sync_location_geog()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSE
        NEW.geog := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_location_geog
BEFORE INSERT OR UPDATE OF latitude, longitude
ON supermarket_location
FOR EACH ROW EXECUTE FUNCTION sync_location_geog();

-- ------------------------------------------------------------
-- Items
-- ------------------------------------------------------------

CREATE TABLE item (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(255)  NOT NULL,
    barcode            VARCHAR(64)   UNIQUE,
    manufacturer_id    BIGINT        NOT NULL REFERENCES manufacturer(id),
    category_id        BIGINT        REFERENCES category(id),
    size_amount        DECIMAL(10,3) NOT NULL CHECK (size_amount > 0),
    size_unit          VARCHAR(16)   NOT NULL,
    unit_type          VARCHAR(16)   NOT NULL
                       CHECK (unit_type IN ('weight', 'volume', 'count')),
    size_in_base_unit  DECIMAL(14,4) NOT NULL CHECK (size_in_base_unit > 0),
    created            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_item_manufacturer ON item (manufacturer_id);
CREATE INDEX idx_item_category     ON item (category_id);
CREATE INDEX idx_item_unit_type    ON item (unit_type);

-- ------------------------------------------------------------
-- Prices (per location, per item, time-series)
-- ------------------------------------------------------------

CREATE TABLE price (
    id           BIGSERIAL PRIMARY KEY,
    location_id  BIGINT         NOT NULL REFERENCES supermarket_location(id),
    item_id      BIGINT         NOT NULL REFERENCES item(id),
    amount       DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    source       VARCHAR(32)    NOT NULL
                 CHECK (source IN ('user_submission', 'scraper', 'api', 'receipt_ocr', 'manual')),
    source_ref   VARCHAR(255),
    timestamp    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_item_time     ON price (item_id, timestamp DESC);
CREATE INDEX idx_price_location_item ON price (location_id, item_id);
CREATE INDEX idx_price_source        ON price (source);

-- ------------------------------------------------------------
-- Auto-bump `updated` on row changes
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION bump_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_manufacturer_updated         BEFORE UPDATE ON manufacturer         FOR EACH ROW EXECUTE FUNCTION bump_updated();
CREATE TRIGGER trg_category_updated             BEFORE UPDATE ON category             FOR EACH ROW EXECUTE FUNCTION bump_updated();
CREATE TRIGGER trg_supermarket_chain_updated    BEFORE UPDATE ON supermarket_chain    FOR EACH ROW EXECUTE FUNCTION bump_updated();
CREATE TRIGGER trg_supermarket_location_updated BEFORE UPDATE ON supermarket_location FOR EACH ROW EXECUTE FUNCTION bump_updated();
CREATE TRIGGER trg_item_updated                 BEFORE UPDATE ON item                 FOR EACH ROW EXECUTE FUNCTION bump_updated();
