-- ============================================================================
-- LG AC Intelligent Conversational Pre-Diagnostic Chatbot
-- PostgreSQL Normalized Database Schema (Phase 2)
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Diagnostic Issues (Trees AC01 - AC16)
CREATE TABLE IF NOT EXISTS diagnostic_issues (
    issue_id VARCHAR(10) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_node_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Diagnostic Nodes
CREATE TABLE IF NOT EXISTS diagnostic_nodes (
    id VARCHAR(100) NOT NULL,
    issue_id VARCHAR(10) NOT NULL REFERENCES diagnostic_issues(issue_id) ON DELETE CASCADE,
    node_type VARCHAR(50) NOT NULL DEFAULT 'question', -- 'question', 'instruction', 'conclusion'
    text_en TEXT NOT NULL,
    text_hi TEXT,
    safety_flag BOOLEAN DEFAULT FALSE,
    instruction TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_id, id)
);

-- 3. Diagnostic Conclusions
CREATE TABLE IF NOT EXISTS conclusions (
    conclusion_id VARCHAR(100) NOT NULL,
    issue_id VARCHAR(10) NOT NULL REFERENCES diagnostic_issues(issue_id) ON DELETE CASCADE,
    probable_cause TEXT NOT NULL,
    confidence NUMERIC(3, 2) DEFAULT 0.85,
    priority VARCHAR(20) DEFAULT 'High', -- 'Low', 'Medium', 'High', 'Critical'
    safety_flag BOOLEAN DEFAULT FALSE,
    technician_note TEXT,
    rag_query TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_id, conclusion_id)
);

-- 4. Conclusion Required Replacement Parts (Many-to-Many)
CREATE TABLE IF NOT EXISTS conclusion_parts (
    id SERIAL PRIMARY KEY,
    issue_id VARCHAR(10) NOT NULL,
    conclusion_id VARCHAR(100) NOT NULL,
    part_name VARCHAR(255) NOT NULL,
    FOREIGN KEY (issue_id, conclusion_id) REFERENCES conclusions(issue_id, conclusion_id) ON DELETE CASCADE
);

-- 5. Node Options (Branching & Decision Tree Edges)
CREATE TABLE IF NOT EXISTS node_options (
    option_id SERIAL PRIMARY KEY,
    issue_id VARCHAR(10) NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    option_index INT NOT NULL,
    label TEXT NOT NULL,
    next_node_id VARCHAR(100),
    redirect_issue_id VARCHAR(10) REFERENCES diagnostic_issues(issue_id) ON DELETE SET NULL,
    action VARCHAR(100), -- e.g. 'instruct_clean_dry_filter'
    conclusion_id VARCHAR(100),
    resolution VARCHAR(100),
    FOREIGN KEY (issue_id, node_id) REFERENCES diagnostic_nodes(issue_id, id) ON DELETE CASCADE
);

-- 6. Error Codes Database (28 LG AC Fault Codes)
CREATE TABLE IF NOT EXISTS error_codes (
    code VARCHAR(20) PRIMARY KEY,
    display VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'Medium',
    customer_action TEXT NOT NULL,
    technician_action TEXT,
    likely_parts JSONB DEFAULT '[]'::jsonb,
    safety_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Users (Customers, Technicians, Admin)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer', -- 'customer', 'technician', 'admin'
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Technicians Pool (10 Fleet Technicians)
CREATE TABLE IF NOT EXISTS technicians (
    id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    specialization VARCHAR(255) NOT NULL,
    rating NUMERIC(2, 1) DEFAULT 4.9,
    active_jobs_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Technician Availability Slots
CREATE TABLE IF NOT EXISTS technician_availability (
    slot_id SERIAL PRIMARY KEY,
    technician_id VARCHAR(50) NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    slot_time VARCHAR(50) NOT NULL, -- 'Morning (09:00 AM - 01:00 PM)', 'Afternoon (01:00 PM - 05:00 PM)', 'Evening (05:00 PM - 08:00 PM)'
    is_booked BOOLEAN DEFAULT FALSE,
    booked_ticket_id VARCHAR(50),
    UNIQUE (technician_id, date, slot_time)
);

-- 10. Service Tickets
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    contact_number VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    service_address TEXT NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    appliance_model VARCHAR(100) NOT NULL,
    serial_number VARCHAR(100),
    issue_tree_id VARCHAR(10) REFERENCES diagnostic_issues(issue_id) ON DELETE SET NULL,
    reported_issue TEXT NOT NULL,
    error_code VARCHAR(20),
    diagnostic_summary TEXT,
    probable_cause TEXT,
    required_parts JSONB DEFAULT '[]'::jsonb,
    priority VARCHAR(20) DEFAULT 'High',
    safety_flag BOOLEAN DEFAULT FALSE,
    assigned_technician_id VARCHAR(50) REFERENCES technicians(id) ON DELETE SET NULL,
    scheduled_date VARCHAR(50),
    scheduled_slot VARCHAR(100),
    status VARCHAR(50) DEFAULT 'assigned', -- 'open', 'assigned', 'in_progress', 'resolved', 'cancelled'
    technician_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Warranty Records (India Policy Verification)
CREATE TABLE IF NOT EXISTS warranty_records (
    record_id SERIAL PRIMARY KEY,
    serial_number VARCHAR(100) UNIQUE,
    model_number VARCHAR(100) NOT NULL,
    purchase_date DATE NOT NULL,
    is_registered BOOLEAN DEFAULT TRUE,
    comprehensive_end_date DATE NOT NULL,
    compressor_end_date DATE NOT NULL,
    pcb_warranty_end_date DATE,
    customer_name VARCHAR(255),
    disclaimer TEXT DEFAULT 'Subject to physical inspection of unit and purchase invoice by authorized service personnel.'
);

-- Indexes for Fast Querying
CREATE INDEX IF NOT EXISTS idx_nodes_issue ON diagnostic_nodes(issue_id);
CREATE INDEX IF NOT EXISTS idx_options_node ON node_options(issue_id, node_id);
CREATE INDEX IF NOT EXISTS idx_conclusions_issue ON conclusions(issue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_tech_availability ON technician_availability(technician_id, date, is_booked);

-- 12. Document Chunks (pgvector Knowledge Retrieval Store)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    chunk_id VARCHAR(100) PRIMARY KEY,
    appliance_type VARCHAR(50) NOT NULL DEFAULT 'air-conditioner',
    model VARCHAR(100) NOT NULL DEFAULT 'UW-Q18WUZA',
    source VARCHAR(255) NOT NULL,
    section VARCHAR(255),
    audience VARCHAR(20) NOT NULL, -- 'customer' | 'technician'
    verification_status VARCHAR(50) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chunks_audience ON document_chunks(audience);
CREATE INDEX IF NOT EXISTS idx_chunks_model ON document_chunks(model);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_type ON document_chunks(document_type);
