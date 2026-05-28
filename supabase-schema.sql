-- Create cameras table
CREATE TABLE IF NOT EXISTS public.cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create site_locations table
CREATE TABLE IF NOT EXISTS public.site_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create species table
CREATE TABLE IF NOT EXISTS public.species (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT CHECK (type IN ('Seabird', 'Predator')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create behaviors table
CREATE TABLE IF NOT EXISTS public.behaviors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('Seabird', 'Predator')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(name, type)
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create templates table
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT UNIQUE NOT NULL,
    type TEXT CHECK (type IN ('Seabird', 'Predator')) NOT NULL,
    species TEXT NOT NULL,
    behavior TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create annotations table
CREATE TABLE IF NOT EXISTS public.annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_filename TEXT NOT NULL,
    end_filename TEXT NOT NULL,
    site TEXT NOT NULL,
    camera TEXT NOT NULL,
    retrieval_date TEXT NOT NULL,
    type TEXT NOT NULL,
    species TEXT NOT NULL,
    behavior TEXT NOT NULL,
    sequence_start_time TEXT,
    sequence_end_time TEXT,
    is_single_image TEXT NOT NULL,
    reviewer_name TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Row Level Security) on all tables (or keep it open for public anon client edits as requested)
ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behaviors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

-- Allow public read & write access since this is a local desktop application using a publishable key
DROP POLICY IF EXISTS "Allow public read" ON public.cameras;
DROP POLICY IF EXISTS "Allow public insert" ON public.cameras;
DROP POLICY IF EXISTS "Allow public update" ON public.cameras;
DROP POLICY IF EXISTS "Allow public delete" ON public.cameras;
CREATE POLICY "Allow public read" ON public.cameras FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.cameras FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.cameras FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.cameras FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public.site_locations;
DROP POLICY IF EXISTS "Allow public insert" ON public.site_locations;
DROP POLICY IF EXISTS "Allow public update" ON public.site_locations;
DROP POLICY IF EXISTS "Allow public delete" ON public.site_locations;
CREATE POLICY "Allow public read" ON public.site_locations FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.site_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.site_locations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.site_locations FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public.species;
DROP POLICY IF EXISTS "Allow public insert" ON public.species;
DROP POLICY IF EXISTS "Allow public update" ON public.species;
DROP POLICY IF EXISTS "Allow public delete" ON public.species;
CREATE POLICY "Allow public read" ON public.species FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.species FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.species FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.species FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public.behaviors;
DROP POLICY IF EXISTS "Allow public insert" ON public.behaviors;
DROP POLICY IF EXISTS "Allow public update" ON public.behaviors;
DROP POLICY IF EXISTS "Allow public delete" ON public.behaviors;
CREATE POLICY "Allow public read" ON public.behaviors FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.behaviors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.behaviors FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.behaviors FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public.team_members;
DROP POLICY IF EXISTS "Allow public insert" ON public.team_members;
DROP POLICY IF EXISTS "Allow public update" ON public.team_members;
DROP POLICY IF EXISTS "Allow public delete" ON public.team_members;
CREATE POLICY "Allow public read" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.team_members FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.team_members FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public.templates;
DROP POLICY IF EXISTS "Allow public insert" ON public.templates;
DROP POLICY IF EXISTS "Allow public update" ON public.templates;
DROP POLICY IF EXISTS "Allow public delete" ON public.templates;
CREATE POLICY "Allow public read" ON public.templates FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.templates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.templates FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public.annotations;
DROP POLICY IF EXISTS "Allow public insert" ON public.annotations;
DROP POLICY IF EXISTS "Allow public update" ON public.annotations;
DROP POLICY IF EXISTS "Allow public delete" ON public.annotations;
CREATE POLICY "Allow public read" ON public.annotations FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.annotations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.annotations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.annotations FOR DELETE USING (true);

-- Insert initial camera records
INSERT INTO public.cameras (name) VALUES
('LOC001'), ('LOC002'), ('LOC003'), ('LOC004'), ('LOC005'), ('LOC006'), ('LOC007'), ('LOC008')
ON CONFLICT (name) DO NOTHING;

-- Insert initial site records
INSERT INTO public.site_locations (name) VALUES
('Location 1'), ('Location 2'), ('Location 3'), ('Location 4'), ('Location 5'), ('Location 6')
ON CONFLICT (name) DO NOTHING;

-- Insert initial species records
INSERT INTO public.species (name, type) VALUES
('Laysan Albatross (Phoebastria immutabilis)', 'Seabird'),
('Black-footed Albatross (Phoebastria nigripes)', 'Seabird'),
('Wedge-tailed Shearwater (Ardenna pacifica)', 'Seabird'),
('Newell''s Shearwater (Puffinus newelli)', 'Seabird'),
('Hawaiian Petrel (Pterodroma sandwichensis)', 'Seabird'),
('Red-tailed Tropicbird (Phaethon rubricauda)', 'Seabird'),
('White-tailed Tropicbird (Phaethon lepturus)', 'Seabird'),
('Brown Booby (Sula leucogaster)', 'Seabird'),
('Red-footed Booby (Sula sula)', 'Seabird'),
('Great Frigatebird (Fregata minor)', 'Seabird'),
('Sooty Tern (Onychoprion fuscatus)', 'Seabird'),
('Kolea (Pluvialis fulva)', 'Seabird'),
('Unidentified Pewee (Contopus sp.)', 'Seabird'),
('Rat (Rattus sp.)', 'Predator'),
('Cat (Felis catus)', 'Predator'),
('Mongoose (Herpestes javanicus)', 'Predator'),
('Barn Owl (Tyto alba)', 'Predator'),
('Dog (Canis lupus familiaris)', 'Predator'),
('Goat (Capra hircus)', 'Predator'),
('Deer (Cervidae)', 'Predator'),
('Black-crowned Night-Heron (Nycticorax nycticorax)', 'Predator'),
('Cattle Egret (Bubulcus ibis)', 'Predator')
ON CONFLICT (name) DO NOTHING;

-- Insert initial behavior records
INSERT INTO public.behaviors (name, type) VALUES
('Chick rearing', 'Seabird'),
('Cleaning', 'Seabird'),
('Courtship', 'Seabird'),
('Defending territory', 'Seabird'),
('Feeding', 'Seabird'),
('Flying', 'Seabird'),
('Foraging', 'Seabird'),
('Incubating', 'Seabird'),
('Nesting', 'Seabird'),
('Preening', 'Seabird'),
('Resting', 'Seabird'),
('Predation', 'Predator'),
('Scavenging', 'Predator'),
('Passing through', 'Predator'),
('Hunting', 'Predator'),
('Resting', 'Predator'),
('Foraging', 'Predator')
ON CONFLICT (name, type) DO NOTHING;

-- Insert initial template records
INSERT INTO public.templates (label, type, species, behavior) VALUES
('Newell''s Shearwater - Nesting', 'Seabird', 'Newell''s Shearwater (Puffinus newelli)', 'Nesting'),
('Newell''s Shearwater - Flying', 'Seabird', 'Newell''s Shearwater (Puffinus newelli)', 'Flying'),
('Hawaiian Petrel - Nesting', 'Seabird', 'Hawaiian Petrel (Pterodroma sandwichensis)', 'Nesting'),
('Hawaiian Petrel - Flying', 'Seabird', 'Hawaiian Petrel (Pterodroma sandwichensis)', 'Flying'),
('Laysan Albatross - Courtship', 'Seabird', 'Laysan Albatross (Phoebastria immutabilis)', 'Courtship'),
('Laysan Albatross - Nesting', 'Seabird', 'Laysan Albatross (Phoebastria immutabilis)', 'Nesting'),
('Cat - Predation', 'Predator', 'Cat (Felis catus)', 'Predation'),
('Cat - Passing through', 'Predator', 'Cat (Felis catus)', 'Passing through'),
('Rat - Predation', 'Predator', 'Rat (Rattus sp.)', 'Predation'),
('Mongoose - Hunting', 'Predator', 'Mongoose (Herpestes javanicus)', 'Hunting'),
('Barn Owl - Hunting', 'Predator', 'Barn Owl (Tyto alba)', 'Hunting')
ON CONFLICT (label) DO NOTHING;

-- Enable Realtime for all tables to support concurrent annotation workflows safely
DO $$
BEGIN
  -- public.cameras
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cameras'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cameras;
  END IF;

  -- public.site_locations
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'site_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_locations;
  END IF;

  -- public.species
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'species'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.species;
  END IF;

  -- public.behaviors
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'behaviors'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.behaviors;
  END IF;

  -- public.team_members
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  END IF;

  -- public.templates
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.templates;
  END IF;

  -- public.annotations
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'annotations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.annotations;
  END IF;
END $$;

