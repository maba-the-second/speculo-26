import { Router, Request, Response } from 'express';
import multer from 'multer';
import { supabase } from '../lib/supabase';
import { setupStudentFolder, uploadPhoto } from '../lib/drive';

import os from 'os';

const router = Router();

// Store files on disk temporarily to prevent out-of-memory crashes on free hosting
const upload = multer({ 
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit per file
});

/**
 * Creates a new submission record and generates Google Drive folders.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, name, email, phone, dob, grade, school, president } = req.body;

    if (!type || !name || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Set up Google Drive folders
    const driveFolderId = await setupStudentFolder(type, school, name);

    // Insert into Supabase
    const { data, error } = await supabase
      .from('submissions')
      .insert([
        {
          type,
          name,
          email,
          phone,
          dob,
          grade,
          school,
          president,
          drive_folder_id: driveFolderId
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase insertion error:', error);
      return res.status(500).json({ error: 'Failed to save submission to database' });
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('Submission error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Uploads a photo to a specific submission and category.
 */
router.post('/:id/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    const file = req.file;

    if (!file || !category) {
      return res.status(400).json({ error: 'Missing file or category' });
    }

    // 1. Fetch submission to get drive_folder_id
    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('drive_folder_id')
      .eq('id', id)
      .single();

    if (fetchError || !submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // 2. Upload to Google Drive
    const driveResult = await uploadPhoto(submission.drive_folder_id, category, file);

    // 3. Save photo record to Supabase
    const { data, error: insertError } = await supabase
      .from('submission_photos')
      .insert([
        {
          submission_id: id,
          category,
          file_name: file.originalname,
          file_size: file.size,
          drive_file_id: driveResult.id,
          drive_view_url: driveResult.webViewLink
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save photo record to DB:', insertError);
      return res.status(500).json({ error: 'Failed to save photo metadata' });
    }

    return res.status(200).json({ success: true, photo: data });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error during upload' });
  }
});

export default router;
