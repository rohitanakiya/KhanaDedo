-- Adds a vegan flag to menu_items.
--
-- "vegetarian" (existing veg column) means no meat.
-- "vegan" means no animal products at all — no dairy, no eggs, no honey.
-- Every vegan item is veg, but not every veg item is vegan (e.g. paneer
-- dishes are veg but not vegan).
--
-- Default FALSE so existing rows aren't broken; seed re-runs will set
-- the correct values via ON CONFLICT DO UPDATE.

ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS vegan BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_menu_items_vegan ON menu_items(vegan);
