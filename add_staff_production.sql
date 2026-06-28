-- Add mechanic staff members
INSERT INTO staff (id, name, phone) VALUES
  (gen_random_uuid(), 'Tomasz Jarnot', '511919797'),
  (gen_random_uuid(), 'Rafal Rychlik', '505915219')
ON CONFLICT DO NOTHING;

-- Verify
SELECT id, name, phone, created_at FROM staff ORDER BY created_at DESC LIMIT 10;
