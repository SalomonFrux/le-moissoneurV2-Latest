-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scrapers table with enhanced configuration
CREATE TABLE IF NOT EXISTS scrapers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    type TEXT DEFAULT 'playwright',
    status TEXT DEFAULT 'idle',
    country TEXT DEFAULT 'Unknown',
    job_id TEXT,
    data_count INTEGER DEFAULT 0,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    selectors JSONB NOT NULL DEFAULT '{
        "main": {
            "selectors": [{"type": "css", "value": ""}]
        },
        "fields": {},
        "pagination": {
            "type": "nextButton",
            "selectors": [{"type": "css", "value": ""}],
            "maxPages": 20
        }
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_run TIMESTAMP WITH TIME ZONE
);

-- Scraping jobs table to track job history
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraper_id UUID REFERENCES scrapers(id),
    job_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    total_pages INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scraped data with enhanced metadata
CREATE TABLE IF NOT EXISTS scraped_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraper_id UUID REFERENCES scrapers(id),
    job_id UUID REFERENCES scraping_jobs(id),
    nom TEXT,
    secteur TEXT,
    pays TEXT,
    site_web TEXT,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    raw_html TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DOM snapshots table for structure verification
CREATE TABLE IF NOT EXISTS dom_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scraper_id UUID REFERENCES scrapers(id),
    snapshot TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scrapers_status ON scrapers(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraped_data_scraper_id ON scraped_data(scraper_id);
CREATE INDEX IF NOT EXISTS idx_scraped_data_job_id ON scraped_data(job_id);
CREATE INDEX IF NOT EXISTS idx_dom_snapshots_scraper_id ON dom_snapshots(scraper_id);

-- Add initial admin users (password: extracteur2025@)
INSERT INTO users (email, password_hash, role)
VALUES 
    ('extracteur@sikso.com', '$2b$10$O4eivaV8lgDoHTm2tgVsLeaovBOWRRN95s95SeANk6RP8Q3FoXkEW', 'admin'),
    ('michael.sea@sikso.ch', '$2b$12$YuxljhRa6aPeDBNA76VSiuQMtnUEeLAYMp99f4jLpbP8PjLI5vcNW', 'admin')
ON CONFLICT (email) DO NOTHING;

