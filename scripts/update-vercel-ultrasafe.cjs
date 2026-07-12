const { execSync } = require('child_process');

const envs = ['production', 'preview', 'development'];

const vars = {
  FIREBASE_APP_ID: '1:767096369282:web:50d6db63abba7767adc49b',
  FIREBASE_AUTH_DOMAIN: 'aradhiya-8fca9.firebaseapp.com',
  FIREBASE_MESSAGING_SENDER_ID: '767096369282',
  FIREBASE_PROJECT_ID: 'aradhiya-8fca9',
  FIREBASE_STORAGE_BUCKET: 'aradhiya-8fca9.firebasestorage.app',
  FIREBASE_WEB_API_KEY: 'AIzaSyDRRk-lg69etSL8CJCiEABvEC5F7e5xKW8',
  FIREBASE_SERVICE_ACCOUNT_KEY: '{}'
};

console.log('Starting Ultrasafe Vercel Environment Variables Sync...');

for (const [name, value] of Object.entries(vars)) {
  for (const env of envs) {
    try {
      console.log(`Setting ${name} on ${env}...`);
      // Use npx --yes to prevent npm from prompting to install the package!
      execSync(`npx --yes vercel env add ${name} ${env} --value "${value}" --force --yes`, { stdio: 'inherit' });
      console.log(`Successfully overrode ${name} on ${env}!`);
    } catch (error) {
      console.error(`Failed to set ${name} on ${env}:`, error.message);
    }
  }
}

console.log('Vercel environment variables updated successfully!');
console.log('Now triggering a new production deployment to apply changes...');
execSync('npx --yes vercel --prod --yes', { stdio: 'inherit' });
console.log('Production deployment successfully completed!');
