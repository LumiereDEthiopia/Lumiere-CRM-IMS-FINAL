-- Unify item categories onto the shared "Category" model.
-- Items now use the same Category records/IDs as Products and /admin/categories.
-- This migration is data-preserving: it does NOT delete any category.

-- DEFERRED: this migration formerly merged the legacy ItemCategory table into
-- Category and dropped the source table. That is outside the approved
-- additive-only production migration policy. Keep this migration as a no-op;
-- preserve the existing category schema until a separately reviewed additive
-- compatibility design is available.
