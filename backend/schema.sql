-- PostgreSQL Schema for Multi-Tier Khanmigo AI Tutor

CREATE TYPE academic_tier AS ENUM ('PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SEC', 'BS_GRADUATION');
CREATE TYPE user_role AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
CREATE TYPE subject_category AS ENUM ('STEM', 'HUMANITIES', 'LANGUAGES', 'ISLAMIYAT', 'BUSINESS');

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'STUDENT',
    current_tier academic_tier DEFAULT 'SECONDARY',
    preferred_language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subjects (
    subject_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    category subject_category NOT NULL,
    tier academic_tier NOT NULL,
    system_prompt_template TEXT NOT NULL,
    enable_rtl BOOLEAN DEFAULT FALSE,
    allowed_tools JSONB DEFAULT '["chat"]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(subject_id) ON DELETE CASCADE,
    session_title VARCHAR(200) DEFAULT 'New Learning Session',
    workspace_state JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    sender VARCHAR(10) CHECK (sender IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);