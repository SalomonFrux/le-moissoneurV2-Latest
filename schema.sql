-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables (optional, be cautious if you have data you want to keep)
-- Consider dropping them in reverse order of dependency if you uncomment
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP TABLE IF EXISTS companies CASCADE;
-- DROP TABLE IF EXISTS scraped_data CASCADE;
-- DROP TABLE IF EXISTS scrapers CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Create scrapers table
CREATE TABLE IF NOT EXISTS scrapers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT DEFAULT 'idle',
    type TEXT DEFAULT 'playwright',
    frequency TEXT DEFAULT 'manual',
    country TEXT DEFAULT 'Aucune info' NOT NULL,
    selectors JSONB DEFAULT '{"main": null}'::jsonb,
    last_run TIMESTAMP WITH TIME ZONE,
    data_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT valid_frequency CHECK (frequency IN ('manual', 'daily', 'weekly', 'monthly'))
);

-- Create scraped_data table
CREATE TABLE IF NOT EXISTS scraped_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraper_id UUID REFERENCES scrapers(id) ON DELETE CASCADE,
    nom TEXT,
    contenu TEXT,
    lien TEXT,
    secteur TEXT,
    pays TEXT,
    source TEXT,
    site_web TEXT,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT unique_entry UNIQUE (scraper_id, nom, pays, source)
);

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    sector TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT unique_company UNIQUE (name, country, source)
);

-- Create profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY NOT NULL, -- This ID MUST match the ID from auth.users
    email TEXT UNIQUE,            -- Store email for convenience, keep in sync with auth.users.email
    role TEXT NOT NULL DEFAULT 'user', -- Default role, can be 'admin', 'editor', etc.
    full_name TEXT,               -- Example: add other profile fields as needed
    avatar_url TEXT,              -- Example
    last_login TIMESTAMP WITH TIME ZONE, -- For tracking user activity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_auth_user_id FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Comments for tables
COMMENT ON TABLE scrapers IS 'Configuration des scrapers';
COMMENT ON TABLE scraped_data IS 'Données récupérées par les scrapers';
COMMENT ON TABLE companies IS 'Table optionnelle pour l''agrégation des données';
COMMENT ON TABLE profiles IS 'Stores user profile information, extending Supabase auth.users.';

-- Comments for profiles table columns
COMMENT ON COLUMN profiles.id IS 'Foreign key referencing auth.users.id from Supabase authentication.';
COMMENT ON COLUMN profiles.email IS 'User''s email, synced from auth.users.email for convenience.';
COMMENT ON COLUMN profiles.role IS 'Application-specific user role (e.g., admin, user).';
COMMENT ON COLUMN profiles.full_name IS 'Full name of the user.';
COMMENT ON COLUMN profiles.avatar_url IS 'URL to the user''s avatar image.';
COMMENT ON COLUMN profiles.last_login IS 'Timestamp of the user''s last login.';


-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Create triggers for automatic timestamp updates
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_scraped_data_updated_at') THEN
        CREATE TRIGGER update_scraped_data_updated_at
            BEFORE UPDATE ON scraped_data
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_companies_updated_at') THEN
        CREATE TRIGGER update_companies_updated_at
            BEFORE UPDATE ON companies
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_scrapers_updated_at') THEN
        CREATE TRIGGER update_scrapers_updated_at
            BEFORE UPDATE ON scrapers
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
        CREATE TRIGGER update_profiles_updated_at
            BEFORE UPDATE ON profiles
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scraped_data_scraper_id ON scraped_data(scraper_id);
CREATE INDEX IF NOT EXISTS idx_scraped_data_nom ON scraped_data(nom);
CREATE INDEX IF NOT EXISTS idx_scraped_data_pays ON scraped_data(pays);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(country);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Enable Row Level Security (RLS)
ALTER TABLE scrapers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- POLICIES (These are examples, adjust them to your exact needs)

-- scrapers policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users on scrapers" ON scrapers;
CREATE POLICY "Enable read access for all authenticated users on scrapers" ON scrapers
    FOR SELECT TO authenticated USING (true);
-- Add policies for insert, update, delete on scrapers, likely restricted to admins or owners

-- scraped_data policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users on scraped_data" ON scraped_data;
CREATE POLICY "Enable read access for all authenticated users on scraped_data" ON scraped_data
    FOR SELECT TO authenticated USING (true);
-- Add policies for insert, update, delete on scraped_data

-- companies policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users on companies" ON companies;
CREATE POLICY "Enable read access for all authenticated users on companies" ON companies
    FOR SELECT TO authenticated USING (true);
-- Add policies for insert, update, delete on companies

-- profiles policies
DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
CREATE POLICY "Users can read their own profile" ON profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Example: Admin users can manage all profiles (adjust role name if needed)
-- This requires a way to check the user's role, often via a helper function or by joining with the profiles table.
-- For simplicity, this policy allows service_role (backend) to do anything.
DROP POLICY IF EXISTS "Allow service_role full access to profiles" ON profiles;
CREATE POLICY "Allow service_role full access to profiles" ON profiles
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);


-- Create statistics summary function (Your existing definition is fine)
-- ... (your get_statistics_summary function here if not already present) ...
-- Ensure grant is present:
-- GRANT EXECUTE ON FUNCTION get_statistics_summary() TO authenticated;

-- Add updated_at column to scrapers table if it doesn't exist
ALTER TABLE scrapers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- IMPORTANT: User creation in auth.users and corresponding profiles inserts
-- MUST be done AFTER this schema is applied.
-- 1. Add users via Supabase Dashboard (Authentication -> Users)
--    - extracteur@sikso.com (password: extracteur2025@) -> Get its UUID
--    - michael.sea@sikso.ch (password: Ext@2025) -> Get its UUID
-- 2. Then, MANUALLY insert into the profiles table using those UUIDs:
--    INSERT INTO profiles (id, email, role, last_login) VALUES ('auth_user_uuid_1', 'extracteur@sikso.com', 'admin', NOW());
--    INSERT INTO profiles (id, email, role, last_login) VALUES ('auth_user_uuid_2', 'michael.sea@sikso.ch', 'admin', NOW());

-- Print a message
SELECT 'Schema setup complete. Remember to add users to auth.users via Supabase dashboard and then insert their profiles here.';



--Manually Insert into profiles Table:
--After the users are in auth.users and the profiles table exists, run the INSERT INTO profiles ... commands (from the comments at the end of the schema or my previous message), replacing 'auth_user_uuid_1' and 'auth_user_uuid_2' with the actual UUIDs you got.
--Example for extracteur@sikso.com (assuming its UUID was 9c427534-46ce-414c-a412-4bf6c6ee34f0):

        INSERT INTO profiles (id, email, role, last_login) 
        VALUES ('fe41d14e-0aa3-4ba5-bd57-1e65582356a5', 'michael.sea@sikso.ch', 'admin', NOW())
        ON CONFLICT (id) DO UPDATE SET 
            email = EXCLUDED.email, 
            role = EXCLUDED.role, 
            last_login = EXCLUDED.last_login, 
            updated_at = NOW(); 