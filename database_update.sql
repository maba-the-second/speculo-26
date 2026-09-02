-- RUN THIS ENTIRE FILE IN THE SUPABASE SQL EDITOR

-- 1. ADD NEW COLUMNS FOR THE PHYSICAL FORM UPDATE
ALTER TABLE submissions ADD COLUMN president_phone TEXT;
ALTER TABLE submissions ADD COLUMN mic_name TEXT;
ALTER TABLE submissions ADD COLUMN mic_phone TEXT;
ALTER TABLE submissions ADD COLUMN participants_count INTEGER;
ALTER TABLE submissions ADD COLUMN non_veg_count INTEGER;
ALTER TABLE submissions ADD COLUMN veg_count INTEGER;

-- 2. REMOVE 'REQUIRED' RULE FROM OLD FIELDS (Physical form no longer uses them)
ALTER TABLE submissions ALTER COLUMN name DROP NOT NULL;
ALTER TABLE submissions ALTER COLUMN phone DROP NOT NULL;

-- 3. CREATE VIEW FOR ONLINE SUBMISSIONS (With full Drive link)
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

-- 4. CREATE VIEW FOR PHYSICAL SUBMISSIONS (Clean view for School/MIC info)
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

