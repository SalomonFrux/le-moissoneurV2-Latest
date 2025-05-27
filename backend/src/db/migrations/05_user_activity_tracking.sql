-- User Activity Tables

-- Table to store user activities
CREATE TABLE IF NOT EXISTS user_activities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_user_activities_user FOREIGN KEY (user_id)
        REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indices for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_action ON user_activities(action);
CREATE INDEX IF NOT EXISTS idx_user_activities_resource ON user_activities(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_timestamp ON user_activities(timestamp);

-- User session tracking
DO $$ 
BEGIN
    -- Drop the existing table if it exists
    DROP TABLE IF EXISTS user_sessions CASCADE;
    
    -- Create the table with the correct structure
    CREATE TABLE user_sessions (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth.users(id),
        token_hash VARCHAR(128) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        last_active TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN DEFAULT true,
        revoked_at TIMESTAMPTZ,
        revocation_reason VARCHAR(50),
        CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id)
            REFERENCES auth.users(id) ON DELETE CASCADE
    );
END $$;

-- Create indices for user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);

-- Resource access logs
CREATE TABLE IF NOT EXISTS resource_access_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    action VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time INTEGER,
    error_details TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_access_logs_user ON resource_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_access_logs_resource ON resource_access_logs(resource_type, resource_id);

-- Activity statistics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS user_activity_stats AS
SELECT 
    user_id,
    date_trunc('day', timestamp) as day,
    action,
    resource_type,
    count(*) as action_count,
    avg(CASE 
        WHEN details->>'responseTime' IS NOT NULL 
        THEN (details->>'responseTime')::numeric 
        ELSE null 
    END) as avg_response_time
FROM user_activities
GROUP BY user_id, date_trunc('day', timestamp), action, resource_type
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_stats ON user_activity_stats 
    (user_id, day, action, resource_type);

-- Function to refresh activity statistics
CREATE OR REPLACE FUNCTION refresh_activity_stats()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_activity_stats;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh stats when new activities are logged
CREATE TRIGGER refresh_activity_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_activities
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_activity_stats();

-- Function to clean up old activity logs
CREATE OR REPLACE FUNCTION cleanup_old_activities()
RETURNS void AS $$
BEGIN
    -- Delete activities older than 90 days
    DELETE FROM user_activities 
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Delete inactive sessions
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR NOT is_active;
    
    -- Delete old access logs
    DELETE FROM resource_access_logs 
    WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (runs daily at 3 AM)
SELECT cron.schedule(
    'cleanup_old_activities',
    '0 3 * * *',
    'SELECT cleanup_old_activities()'
);
