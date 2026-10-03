-- Demo data. Password for both accounts: Admin123!
INSERT INTO organizations (organization_name)
SELECT 'Demo Training Centre'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE organization_name = 'Demo Training Centre');

INSERT INTO users (organization_id, full_name, email, password_hash, role, account_status)
SELECT o.organization_id, v.full_name, v.email,
       '$2b$12$UhEs9pq/ZI8Q3fN.vuc3.ebmJVKaS2ppiuqdsBFmnEegP.Ha8uEum',
       v.role, 'ACTIVE'
FROM organizations o
CROSS JOIN (VALUES
  ('Demo Admin', 'admin@demo.com', 'ADMIN'),
  ('Demo Staff', 'staff@demo.com', 'STAFF')
) AS v(full_name, email, role)
WHERE o.organization_name = 'Demo Training Centre'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(v.email));
