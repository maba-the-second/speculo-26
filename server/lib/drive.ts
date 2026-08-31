import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account.json';
const CRED_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

// Initialize the Google Drive Client
let driveClient: ReturnType<typeof google.drive> | null = null;

try {
  let authConfig: any = {
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
  };

  if (CRED_JSON) {
    authConfig.credentials = JSON.parse(CRED_JSON);
  } else {
    authConfig.keyFile = KEY_FILE;
  }

  const auth = new google.auth.GoogleAuth(authConfig);
  driveClient = google.drive({ version: 'v3', auth });
} catch (error) {
  console.error('Failed to initialize Google Drive client:', error);
}

/**
 * Searches for a folder by name inside a parent folder.
 * Creates it if it doesn't exist and createIfMissing is true.
 */
export async function getOrCreateFolder(parentId: string, folderName: string, createIfMissing: boolean = true): Promise<string | null> {
  if (!driveClient) throw new Error('Drive client not initialized');

  const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  
  const res = await driveClient.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name)',
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id || null;
  }

  if (createIfMissing) {
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };
    
    const folder = await driveClient.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });
    
    return folder.data.id || null;
  }

  return null;
}

/**
 * Creates the School -> Student folder structure.
 */
export async function setupStudentFolder(type: string, school: string | null, studentName: string): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error('Root folder ID not set');

  let parentGroupFolderId = ROOT_FOLDER_ID;

  if (type === 'physical') {
    parentGroupFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, '_Physical') || ROOT_FOLDER_ID;
  } else if (type === 'online_open') {
    parentGroupFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, '_Open Category') || ROOT_FOLDER_ID;
  } else if (school) {
    // Inter or Intra with school name
    parentGroupFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, school) || ROOT_FOLDER_ID;
  }

  // Create student folder
  const studentFolderId = await getOrCreateFolder(parentGroupFolderId, studentName);
  if (!studentFolderId) throw new Error('Failed to create student folder');
  
  return studentFolderId;
}

/**
 * Uploads a file buffer to a specific category folder under the student's folder.
 */
export async function uploadPhoto(
  studentFolderId: string, 
  category: string, 
  file: Express.Multer.File
): Promise<{ id: string, webViewLink: string }> {
  if (!driveClient) throw new Error('Drive client not initialized');

  // Get or create category folder
  const categoryFolderId = await getOrCreateFolder(studentFolderId, category);
  if (!categoryFolderId) throw new Error('Failed to create category folder');

  const fileMetadata = {
    name: file.originalname,
    parents: [categoryFolderId],
  };

  const media = {
    mimeType: file.mimetype,
    body: fs.createReadStream(file.path),
  };

  try {
    const driveFile = await driveClient.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    // Make the file publicly viewable (or anyone with the link)
    if (driveFile.data.id) {
      await driveClient.permissions.create({
        fileId: driveFile.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        }
      });
    }

    // Clean up temporary file from disk
    fs.unlink(file.path, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });

    return {
      id: driveFile.data.id || '',
      webViewLink: driveFile.data.webViewLink || ''
    };
  } catch (error) {
    // Attempt cleanup even on failure
    fs.unlink(file.path, () => {});
    throw error;
  }
}
