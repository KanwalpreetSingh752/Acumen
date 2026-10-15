import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';

const { MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!MONGODB_URI) throw new Error('MONGODB_URI is required in .env');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  passwordHash: String,
  createdAt: Date
});
const MongoUser = mongoose.models.User || mongoose.model('User', userSchema);

const progressSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  completed: [String]
});
const MongoProgress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  const mongoUsers = await MongoUser.find();
  console.log(`Found ${mongoUsers.length} user(s) in MongoDB.`);

  for (const user of mongoUsers) {
    console.log(`Migrating user: ${user.email}...`);

    // Check if user exists in Supabase Auth
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    let supabaseUser = existingUsers.users.find(u => u.email?.toLowerCase() === user.email.toLowerCase());

    if (!supabaseUser) {
      // Create user in Supabase Auth (without setting a raw password since bcrypt hashes cannot be directly imported as plain text)
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        email_confirm: true,
        user_metadata: { name: user.name }
      });
      if (createError) {
        console.error(`Error creating Supabase Auth user for ${user.email}:`, createError.message);
        continue;
      }
      supabaseUser = newUser.user;
      console.log(`Created Supabase Auth user: ${supabaseUser.id}`);
    } else {
      console.log(`User already exists in Supabase Auth: ${supabaseUser.id}`);
    }

    // Upsert into public.profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: supabaseUser.id,
        name: user.name,
        email: user.email,
        created_at: user.createdAt || new Date()
      });
    if (profileError) console.error(`Error upserting profile for ${user.email}:`, profileError.message);

    // Fetch MongoDB progress for this user
    const mongoProg = await MongoProgress.findOne({ userId: user._id });
    const completedList = mongoProg ? mongoProg.completed : [];

    // Upsert into public.progress
    const { error: progressError } = await supabaseAdmin
      .from('progress')
      .upsert({
        user_id: supabaseUser.id,
        completed: completedList,
        updated_at: new Date()
      });
    if (progressError) console.error(`Error upserting progress for ${user.email}:`, progressError.message);
    else console.log(`Migrated progress for ${user.email}: ${completedList.length} completed item(s).`);
  }

  console.log('Migration complete. Disconnecting MongoDB.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
