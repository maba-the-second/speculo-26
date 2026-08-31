import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Service Key missing in environment variables. Database functionality will fail.');
}

// Use Service Role key for backend operations to bypass RLS
export const supabase = createClient(supabaseUrl, supabaseKey);
