import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import 'dotenv/config';

const dashboardPath = path.join(process.cwd(), 'public', 'dashboard.js');
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

const stateMarker = '// ── State ─────────────────────────────────────────────────────';
const stateIndex = dashboardContent.indexOf(stateMarker);

if (stateIndex === -1) {
  console.error('Could not find state marker in dashboard.js');
  process.exit(1);
}

const roadmapsStr = dashboardContent.substring(0, stateIndex);
const objectStart = roadmapsStr.indexOf('{');
const objectEnd = roadmapsStr.lastIndexOf(';');
const jsonLikeStr = roadmapsStr.substring(objectStart, objectEnd);

let roadmapsObj;
try {
  roadmapsObj = eval('(' + jsonLikeStr + ')');
  console.log('Successfully parsed roadmaps object. Keys:', Object.keys(roadmapsObj));
} catch (e) {
  console.error('Failed to parse roadmaps', e);
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('No MONGODB_URI found in .env');

const subheadingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, default: '' }
}, { _id: false });

const headingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, default: '' },
  subheadings: [subheadingSchema]
}, { _id: false });

const subjectSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '◫' },
  order: { type: Number, default: 0 },
  headings: [headingSchema]
});

const Subject = mongoose.models.Subject || mongoose.model('Subject', subjectSchema);

async function runMigration() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  
  let order = 0;
  for (const [key, data] of Object.entries(roadmapsObj)) {
    await Subject.findOneAndUpdate(
      { key },
      {
        key,
        name: data.name,
        subtitle: data.subtitle,
        icon: data.icon,
        order: order++,
        headings: data.headings
      },
      { upsert: true, new: true }
    );
    console.log(`Upserted subject: ${key}`);
  }
  
  console.log('Seed complete. Disconnecting from MongoDB.');
  await mongoose.disconnect();
  
  // Update dashboard.js
  let restOfFile = dashboardContent.substring(stateIndex);
  let newDashboardContent = `let roadmaps = {};\n\n` + restOfFile;
  
  // Insert loadRoadmaps function
  const initMarker = '// ── Init ──────────────────────────────────────────────────────';
  const initIndex = newDashboardContent.indexOf(initMarker);
  
  const loadRoadmapsCode = `async function loadRoadmaps() {
  try {
    const res = await fetch('/api/roadmaps');
    if (!res.ok) throw new Error('Failed to fetch roadmaps');
    roadmaps = await res.json();
  } catch (err) {
    console.error('Error loading study materials:', err);
  }
}\n\n`;
  
  newDashboardContent = newDashboardContent.substring(0, initIndex) + loadRoadmapsCode + newDashboardContent.substring(initIndex);
  
  // Update IIFE
  newDashboardContent = newDashboardContent.replace(
    `(async () => {
  await loadDashboard();
  await loadProgress();
  render();
})();`,
    `(async () => {
  await loadDashboard();
  await loadRoadmaps();
  await loadProgress();
  render();
})();`
  );
  
  fs.writeFileSync(dashboardPath, newDashboardContent, 'utf8');
  console.log('Successfully updated public/dashboard.js');
}

runMigration().catch(e => {
  console.error(e);
  process.exit(1);
});
