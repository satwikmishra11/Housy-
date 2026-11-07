/**
 * Migration 009: Add display_name, tagline, and slug to projects table.
 * Supports public brand showcase pages and eliminates generic project naming.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS tagline TEXT,
      ADD COLUMN IF NOT EXISTS slug TEXT;

    UPDATE projects
    SET 
      display_name = 'The Palm Serene',
      tagline = 'Artisanal 2 & 3 BHK Living on SG Highway',
      slug = 'the-palm-serene'
    WHERE name = 'Project 1';

    UPDATE projects
    SET 
      display_name = 'Skyline Greens',
      tagline = 'Elevated 2 & 3 BHK Urban Residences near Science City',
      slug = 'skyline-greens'
    WHERE name = 'Project 2';

    UPDATE projects
    SET
      display_name = COALESCE(display_name, name),
      tagline = COALESCE(tagline, 'Premium Residential Living in Ahmedabad'),
      slug = COALESCE(slug, lower(regexp_replace(name, '\\s+', '-', 'g')))
    WHERE slug IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);

    ALTER TABLE projects
      ALTER COLUMN display_name SET DEFAULT 'Residential Living',
      ALTER COLUMN tagline SET DEFAULT 'Artisanal Living in Ahmedabad',
      ALTER COLUMN slug SET DEFAULT gen_random_uuid()::text,
      ALTER COLUMN display_name SET NOT NULL,
      ALTER COLUMN tagline SET NOT NULL,
      ALTER COLUMN slug SET NOT NULL;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_projects_slug;
    ALTER TABLE projects
      DROP COLUMN IF EXISTS slug,
      DROP COLUMN IF EXISTS tagline,
      DROP COLUMN IF EXISTS display_name;
  `);
};
