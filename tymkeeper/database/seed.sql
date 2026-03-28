-- TymKeeper Demo Seed
-- Run this in pgAdmin Query Tool (connected to the tymkeeper database)
-- This creates demo accounts with pre-hashed passwords
-- Admin password: admin123
-- Staff password: staff123

-- Insert demo company
INSERT INTO companies (name, admin_id)
VALUES ('Demo Company', 'ADM-DEMO01')
ON CONFLICT (admin_id) DO UPDATE SET name = EXCLUDED.name;

-- Insert admin user
-- Password hash below = bcrypt hash of "admin123"
INSERT INTO users (company_id, first_name, last_name, email, password_hash, role)
VALUES (
  (SELECT id FROM companies WHERE admin_id = 'ADM-DEMO01'),
  'Admin',
  'User',
  'admin@tymkeeper.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/o0f5Vn7eC',
  'admin'
)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Insert staff user
-- Password hash below = bcrypt hash of "staff123"
INSERT INTO users (company_id, first_name, last_name, email, password_hash, role)
VALUES (
  (SELECT id FROM companies WHERE admin_id = 'ADM-DEMO01'),
  'Jane',
  'Smith',
  'staff@tymkeeper.com',
  '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
  'staff'
)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Confirm
SELECT u.first_name, u.last_name, u.email, u.role, c.admin_id
FROM users u
JOIN companies c ON c.id = u.company_id;
