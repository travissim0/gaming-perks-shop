require('dotenv').config({ path: './production.env' });

module.exports = {
  apps: [{
    name: 'gaming-perks-shop',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      KOFI_VERIFICATION_TOKEN: '8abbf9a7-19fe-43f3-ba4e-36acaaedb2b3'
    }
  }]
}; 