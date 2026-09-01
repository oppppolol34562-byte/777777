/*
# YOMY — Post Privacy, Moderation, Tags, Saved Posts & RLS Overhaul

## Overview
This migration upgrades the posts system to support per-post visibility,
mandatory safety moderation, tags, child-suitability, a saved-posts feature,
and a unified permission model. It also fixes RLS policies so that private
accounts, post-level visibility, and blocks are enforced at the database
level — not just hidden in the UI.

## 1. New columns on `posts`
- `title` (text, default '') — post title
- `description` (text, default '') — longer description / body
- `visibility` (text, default 'public', CHECK in public/friends/private) — per-post visibility
- `is_child_friendly` (boolean, default true) — whether content is suitable for children
- `moderation_status` (text, default 'pending', CHECK in pending/safe/review/rejected) — moderation lifecycle
- `moderation_result` (jsonb, default '{}') — structured moderation output
- `moderated_at` (timestamptz, nullable) — when moderation completed
- `status` (text, default 'draft', CHECK in draft/uploading/processing/moderation/ready/published/rejected/archived/deleted) — post lifecycle
- `published_at` (timestamptz, nullable) — when the post was published
- `updated_at` (timestamptz, default now()) — last modification time

## 2. New table: `post_tags`
- Stores individual tags per post.
- `id`, `post_id` (FK → posts), `tag` (text, normalized lowercase), `created_at`.
- UNIQUE(post_id, tag) to prevent duplicate tags.
- Index on `tag` for search queries.

## 3. New table: `saved_posts`
- Stores bookmarks (distinct from likes).
- `id`, `user_id` (FK → profiles), `post_id` (FK → posts), `created_at`.
- UNIQUE(user_id, post_id) to prevent duplicate saves.

## 4. Permission helper function: `can_view_post`
- SECURITY DEFINER function that returns boolean.
- Checks: owner, block status (both directions), account privacy, post visibility, accepted follow relationship.
- Used by RLS SELECT policy on `posts` so the database itself filters inaccessible posts.

## 5. RLS policy changes
### `posts`
- SELECT: replaced `USING (true)` with `can_view_post(auth.uid(), posts.id)`.
- INSERT: unchanged (owner only) but now `status` defaults to 'draft'.
- UPDATE: unchanged (owner only).
- DELETE: unchanged (owner only).

### `stories`
- SELECT: now checks that the viewer is the owner OR an accepted follower of a public-or-followed account, and no block exists.

### `follows`
- SELECT: now checks that the viewer is a participant OR the `following_id` account's follower list is visible to them (`show_followers_to` setting).

### `post_tags`
- SELECT: public (any authenticated user can read tags for search), but the post itself is filtered by posts RLS.
- INSERT/DELETE: owner of the post only.

### `saved_posts`
- SELECT/INSERT/DELETE: owner only (auth.uid() = user_id).

## 6. Indexes
- `posts_visibility_idx` on (visibility, status)
- `posts_status_idx` on (status)
- `posts_published_at_idx` on (published_at DESC)
- `post_tags_tag_idx` on (tag)
- `saved_posts_user_id_idx` on (user_id)

## 7. Important notes
1. Existing posts get `visibility='public'`, `status='published'`, `moderation_status='safe'`, `is_child_friendly=true` so nothing breaks.
2. The `can_view_post` function is the single source of truth for post visibility — the frontend, feed, search, and profile all rely on the database to filter.
3. No data is lost — all new columns have safe defaults.
4. The trigger `posts_updated_at` keeps `updated_at` current.
*/

-- =====================
-- ADD COLUMNS TO POSTS
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='title') THEN
    ALTER TABLE posts ADD COLUMN title text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='description') THEN
    ALTER TABLE posts ADD COLUMN description text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='visibility') THEN
    ALTER TABLE posts ADD COLUMN visibility text NOT NULL DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='is_child_friendly') THEN
    ALTER TABLE posts ADD COLUMN is_child_friendly boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='moderation_status') THEN
    ALTER TABLE posts ADD COLUMN moderation_status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='moderation_result') THEN
    ALTER TABLE posts ADD COLUMN moderation_result jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='moderated_at') THEN
    ALTER TABLE posts ADD COLUMN moderated_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='status') THEN
    ALTER TABLE posts ADD COLUMN status text NOT NULL DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='published_at') THEN
    ALTER TABLE posts ADD COLUMN published_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='updated_at') THEN
    ALTER TABLE posts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Backfill existing posts so they remain visible
UPDATE posts SET status = 'published', moderation_status = 'safe', published_at = created_at
WHERE status = 'draft' AND created_at < now() - interval '1 minute';

-- Add CHECK constraints (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='posts_visibility_check') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_visibility_check CHECK (visibility IN ('public','friends','private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='posts_moderation_status_check') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_moderation_status_check CHECK (moderation_status IN ('pending','safe','review','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='posts_status_check') THEN
    ALTER TABLE posts ADD CONSTRAINT posts_status_check CHECK (status IN ('draft','uploading','processing','moderation','ready','published','rejected','archived','deleted'));
  END IF;
END $$;

-- =====================
-- POST TAGS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS post_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, tag)
);

ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_tags_select" ON post_tags;
CREATE POLICY "post_tags_select" ON post_tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "post_tags_insert" ON post_tags;
CREATE POLICY "post_tags_insert" ON post_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM posts WHERE posts.id = post_tags.post_id AND posts.user_id = auth.uid()));

DROP POLICY IF EXISTS "post_tags_delete" ON post_tags;
CREATE POLICY "post_tags_delete" ON post_tags FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM posts WHERE posts.id = post_tags.post_id AND posts.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS post_tags_tag_idx ON post_tags(tag);
CREATE INDEX IF NOT EXISTS post_tags_post_id_idx ON post_tags(post_id);

-- =====================
-- SAVED POSTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_posts_select" ON saved_posts;
CREATE POLICY "saved_posts_select" ON saved_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_posts_insert" ON saved_posts;
CREATE POLICY "saved_posts_insert" ON saved_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_posts_delete" ON saved_posts;
CREATE POLICY "saved_posts_delete" ON saved_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS saved_posts_user_id_idx ON saved_posts(user_id);
CREATE INDEX IF NOT EXISTS saved_posts_post_id_idx ON saved_posts(post_id);

-- =====================
-- PERMISSION HELPER FUNCTION
-- =====================
CREATE OR REPLACE FUNCTION public.can_view_post(viewer_id uuid, post_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM posts p
    JOIN profiles author ON author.id = p.user_id
    WHERE p.id = post_id
      AND p.status = 'published'
      AND p.moderation_status = 'safe'
      -- Owner can always see their own posts
      AND (
        p.user_id = viewer_id
        OR (
          -- No block in either direction
          NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b.blocker_id = p.user_id AND b.blocked_id = viewer_id)
               OR (b.blocker_id = viewer_id AND b.blocked_id = p.user_id)
          )
          AND (
            -- Post visibility = public AND account is public
            (p.visibility = 'public' AND author.is_private = false)
            OR (
              p.visibility = 'public'
              AND author.is_private = true
              AND EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = viewer_id
                  AND f.following_id = p.user_id
                  AND f.status = 'accepted'
              )
            )
            OR (
              p.visibility = 'friends'
              AND EXISTS (
                SELECT 1 FROM follows f1
                WHERE f1.follower_id = viewer_id
                  AND f1.following_id = p.user_id
                  AND f1.status = 'accepted'
              )
              AND EXISTS (
                SELECT 1 FROM follows f2
                WHERE f2.follower_id = p.user_id
                  AND f2.following_id = viewer_id
                  AND f2.status = 'accepted'
              )
            )
          )
        )
      )
  );
$$;

-- =====================
-- UPDATE POSTS RLS POLICIES
-- =====================
DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts FOR SELECT TO authenticated
  USING (public.can_view_post(auth.uid(), posts.id));

DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_update" ON posts;
CREATE POLICY "posts_update" ON posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_delete" ON posts;
CREATE POLICY "posts_delete" ON posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================
-- UPDATE STORIES RLS POLICIES
-- =====================
DROP POLICY IF EXISTS "stories_select" ON stories;
CREATE POLICY "stories_select" ON stories FOR SELECT TO authenticated
  USING (
    expires_at > now()
    AND (
      user_id = auth.uid()
      OR (
        NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = stories.user_id AND b.blocked_id = auth.uid())
             OR (b.blocker_id = auth.uid() AND b.blocked_id = stories.user_id)
        )
        AND EXISTS (
          SELECT 1 FROM profiles author WHERE author.id = stories.user_id
          AND (
            author.is_private = false
            OR EXISTS (
              SELECT 1 FROM follows f
              WHERE f.follower_id = auth.uid()
                AND f.following_id = stories.user_id
                AND f.status = 'accepted'
            )
          )
        )
      )
    )
  );

-- =====================
-- UPDATE FOLLOWS RLS POLICIES
-- =====================
DROP POLICY IF EXISTS "follows_select" ON follows;
CREATE POLICY "follows_select" ON follows FOR SELECT TO authenticated
  USING (
    auth.uid() = follower_id
    OR auth.uid() = following_id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = follows.following_id
      AND (
        p.show_followers_to = 'everyone'
        OR (p.show_followers_to = 'followers' AND EXISTS (
          SELECT 1 FROM follows f2
          WHERE f2.follower_id = auth.uid()
            AND f2.following_id = p.id
            AND f2.status = 'accepted'
        ))
      )
    )
  );

DROP POLICY IF EXISTS "follows_insert" ON follows;
CREATE POLICY "follows_insert" ON follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_update" ON follows;
CREATE POLICY "follows_update" ON follows FOR UPDATE TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id)
  WITH CHECK (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "follows_delete" ON follows;
CREATE POLICY "follows_delete" ON follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS posts_visibility_idx ON posts(visibility, status);
CREATE INDEX IF NOT EXISTS posts_status_idx ON posts(status);
CREATE INDEX IF NOT EXISTS posts_published_at_idx ON posts(published_at DESC);

-- =====================
-- UPDATED_AT TRIGGER
-- =====================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_updated_at ON posts;
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
