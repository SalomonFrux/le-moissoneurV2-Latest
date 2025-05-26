-- Authentication and Security Tables

-- Enhanced Users Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS
    password_hash VARCHAR(128),
    password_salt VARCHAR(32),
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login TIMESTAMPTZ,
    require_password_change BOOLEAN DEFAULT false,
    last_password_change TIMESTAMPTZ,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(32);

-- User Permissions Table
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    permission VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(user_id, permission)
);

-- Security Events Table
CREATE TABLE IF NOT EXISTS security_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    details JSONB,
    user_id UUID REFERENCES users(id),
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp);

-- Session Management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    token_hash VARCHAR(128) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- Password History
CREATE TABLE IF NOT EXISTS password_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    password_hash VARCHAR(128) NOT NULL,
    password_salt VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);

-- Functions and Triggers

-- Function to check password history
CREATE OR REPLACE FUNCTION check_password_history()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM password_history
        WHERE user_id = NEW.id
        AND password_hash = NEW.password_hash
        AND created_at > NOW() - INTERVAL '1 year'
    ) THEN
        RAISE EXCEPTION 'Password was used in the past year';
    END IF;
    
    -- Store new password in history
    INSERT INTO password_history (user_id, password_hash, password_salt)
    VALUES (NEW.id, NEW.password_hash, NEW.password_salt);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check password history on password change
CREATE TRIGGER check_password_history_trigger
    AFTER UPDATE OF password_hash ON users
    FOR EACH ROW
    WHEN (OLD.password_hash IS DISTINCT FROM NEW.password_hash)
    EXECUTE FUNCTION check_password_history();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < NOW()
    AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to clean up expired sessions
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('cleanup_expired_sessions', '0 0 * * *', 'SELECT cleanup_expired_sessions()');

-- Function to handle failed login attempts
CREATE OR REPLACE FUNCTION handle_failed_login()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.failed_attempts >= 5 THEN
        NEW.locked_until := NOW() + INTERVAL '15 minutes';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for failed login attempts
CREATE TRIGGER handle_failed_login_trigger
    BEFORE UPDATE OF failed_attempts ON users
    FOR EACH ROW
    EXECUTE FUNCTION handle_failed_login();
