-- Submissions Table
CREATE TABLE submissions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('online_intra', 'online_inter', 'online_open', 'physical')),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  dob DATE,
  grade TEXT,
  school TEXT,
  president TEXT,
  drive_folder_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submission Photos Table
CREATE TABLE submission_photos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  drive_file_id TEXT,
  drive_view_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: No Row Level Security (RLS) policies are defined here 
-- because all backend operations are performed securely via the Service Role Key.

-- ADD THESE COLUMNS IF YOU ARE UPDATING FROM AN OLDER VERSION:
-- ALTER TABLE submissions ADD COLUMN president_phone TEXT;
-- ALTER TABLE submissions ADD COLUMN mic_name TEXT;
-- ALTER TABLE submissions ADD COLUMN mic_phone TEXT;
-- ALTER TABLE submissions ADD COLUMN participants_count INTEGER;
-- ALTER TABLE submissions ADD COLUMN non_veg_count INTEGER;
-- ALTER TABLE submissions ADD COLUMN veg_count INTEGER;
-- ALTER TABLE submissions ALTER COLUMN name DROP NOT NULL;
-- ALTER TABLE submissions ALTER COLUMN phone DROP NOT NULL;


-- ==========================================
-- VIEWS TO SEPARATE ONLINE AND PHYSICAL DATA
-- ==========================================

-- 1. Online Submissions View
CREATE OR REPLACE VIEW online_submissions_view AS
SELECT 
    id,
    type AS category,
    name AS participant_name,
    email,
    phone,
    dob AS date_of_birth,
    grade,
    school,
    'https://drive.google.com/drive/folders/' || drive_folder_id AS google_drive_link,
    created_at
FROM 
    submissions
WHERE 
    type != 'physical';

-- 2. Physical Submissions View
CREATE OR REPLACE VIEW physical_submissions_view AS
SELECT 
    id,
    school,
    president AS president_name,
    president_phone,
    email,
    mic_name AS master_in_charge,
    mic_phone AS mic_contact,
    participants_count,
    veg_count,
    non_veg_count,
    created_at
FROM 
    submissions
WHERE 
    type = 'physical';

