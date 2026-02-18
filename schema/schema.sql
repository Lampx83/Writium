-- Writium schema – single file for both standalone (writium) and embedded (ai_portal).
-- Standalone: run Part 1 (up to #STANDALONE_END). Embedded: run Part 2.

-- ========== Part 1: Standalone (DB writium, schema writium) ==========

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS writium;

CREATE TABLE IF NOT EXISTS writium.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writium.projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES writium.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  team_members JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writium.write_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES writium.users(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES writium.projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled document',
  content         TEXT NOT NULL DEFAULT '',
  template_id     TEXT,
  references_json JSONB NOT NULL DEFAULT '[]',
  share_token     TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_write_articles_user_id ON writium.write_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_write_articles_updated_at ON writium.write_articles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_write_articles_project_id ON writium.write_articles(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_write_articles_share_token ON writium.write_articles(share_token) WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS writium.write_article_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id       UUID NOT NULL REFERENCES writium.write_articles(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES writium.users(id) ON DELETE CASCADE,
  author_display   TEXT NOT NULL DEFAULT '',
  content          TEXT NOT NULL DEFAULT '',
  parent_id        UUID REFERENCES writium.write_article_comments(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_write_article_comments_article_id ON writium.write_article_comments(article_id);
CREATE INDEX IF NOT EXISTS idx_write_article_comments_parent_id ON writium.write_article_comments(parent_id);

CREATE TABLE IF NOT EXISTS writium.write_article_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES writium.write_articles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_write_article_versions_article_id ON writium.write_article_versions(article_id);
CREATE INDEX IF NOT EXISTS idx_write_article_versions_created_at ON writium.write_article_versions(article_id, created_at DESC);

-- #STANDALONE_END

-- ========== Part 2: Portal embedded (schema ai_portal; requires ai_portal.users, ai_portal.projects) ==========

CREATE TABLE IF NOT EXISTS ai_portal.write_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES ai_portal.users(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES ai_portal.projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled document',
  content         TEXT NOT NULL DEFAULT '',
  template_id     TEXT,
  references_json JSONB NOT NULL DEFAULT '[]',
  share_token     TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_write_articles_user_id ON ai_portal.write_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_write_articles_updated_at ON ai_portal.write_articles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_write_articles_project_id ON ai_portal.write_articles(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_write_articles_share_token ON ai_portal.write_articles(share_token) WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_portal.write_article_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id       UUID NOT NULL REFERENCES ai_portal.write_articles(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES ai_portal.users(id) ON DELETE CASCADE,
  author_display   TEXT NOT NULL DEFAULT '',
  content          TEXT NOT NULL DEFAULT '',
  parent_id        UUID REFERENCES ai_portal.write_article_comments(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_write_article_comments_article_id ON ai_portal.write_article_comments(article_id);
CREATE INDEX IF NOT EXISTS idx_write_article_comments_parent_id ON ai_portal.write_article_comments(parent_id);

CREATE TABLE IF NOT EXISTS ai_portal.write_article_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES ai_portal.write_articles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_write_article_versions_article_id ON ai_portal.write_article_versions(article_id);
CREATE INDEX IF NOT EXISTS idx_write_article_versions_created_at ON ai_portal.write_article_versions(article_id, created_at DESC);
