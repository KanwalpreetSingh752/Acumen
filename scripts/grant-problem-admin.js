import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error('Usage: node scripts/grant-problem-admin.js admin@example.com');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.from('profiles').update({ is_admin: true }).eq('email', email).select('id,email,is_admin');
if (error) throw error;
if (!data.length) throw new Error(`No profile found for ${email}. The user must sign in first.`);
console.log(`Problem-management access granted to ${email}.`);
