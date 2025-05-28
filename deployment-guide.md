# Deployment Guide: Gaming Perks Shop to DigitalOcean

## Prerequisites
- DigitalOcean droplet (Ubuntu 20.04+ recommended)
- Domain: freeinf.org pointed to your droplet IP
- Node.js 18+ installed on server
- Git access to your repository

## Step 1: Server Setup

### Install Node.js and dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

## Step 2: Deploy Application

### Clone and setup your app
```bash
# Navigate to web directory
cd /var/www

# Clone your repository
sudo git clone https://github.com/travissim0/gaming-perks-shop.git
sudo chown -R $USER:$USER gaming-perks-shop
cd gaming-perks-shop

# Install dependencies
npm install

# Create production environment file
sudo nano .env.local
```

### Environment Variables (.env.local)
```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Site URL
NEXT_PUBLIC_SITE_URL=https://freeinf.org
```

### Build and start application
```bash
# Build the application
npm run build

# Start with PM2
pm2 start npm --name "gaming-perks-shop" -- start

# Configure PM2 to start on boot
pm2 startup
pm2 save
```

## Step 3: Nginx Configuration

### Create Nginx config
```bash
sudo nano /etc/nginx/sites-available/freeinf.org
```

```nginx
server {
    listen 80;
    server_name freeinf.org www.freeinf.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable the site
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/freeinf.org /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## Step 4: SSL Certificate (Let's Encrypt)

```bash
# Get SSL certificate
sudo certbot --nginx -d freeinf.org -d www.freeinf.org

# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 5: Stripe Webhook Configuration

### Update Stripe webhook endpoint
1. Go to Stripe Dashboard > Webhooks
2. Update endpoint URL to: `https://freeinf.org/api/webhooks/stripe`
3. Test the webhook to ensure it's working

## Step 6: DNS Configuration

### Point domain to DigitalOcean
1. **A Record**: `freeinf.org` → Your droplet IP
2. **A Record**: `www.freeinf.org` → Your droplet IP
3. **Wait for DNS propagation** (up to 24 hours)

## Step 7: Firewall Setup

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw status
```

## Step 8: Monitoring and Maintenance

### PM2 monitoring
```bash
# View running processes
pm2 list

# View logs
pm2 logs gaming-perks-shop

# Restart application
pm2 restart gaming-perks-shop

# View monitoring dashboard
pm2 monit
```

### Application updates
```bash
cd /var/www/gaming-perks-shop

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Rebuild application
npm run build

# Restart with PM2
pm2 restart gaming-perks-shop
```

## Step 9: Database Considerations

### Production database setup
- Ensure your Supabase project is in production mode
- Consider upgrading to a paid Supabase plan for better performance
- Set up database backups

### Environment-specific configurations
```bash
# Production optimizations in next.config.ts
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    optimize: true,
  },
}

module.exports = nextConfig
```

## Step 10: Testing Production Deployment

### Test checklist
- [ ] Site loads at https://freeinf.org
- [ ] User registration/login works
- [ ] Stripe payments work (use test mode first)
- [ ] Webhooks are receiving events
- [ ] Database operations work
- [ ] Email notifications work
- [ ] All API endpoints respond correctly

## Troubleshooting

### Common issues
1. **502 Bad Gateway**: Check if PM2 process is running (`pm2 list`)
2. **SSL issues**: Verify certbot worked (`sudo certbot certificates`)
3. **Database connection**: Check Supabase credentials in `.env.local`
4. **Webhook failures**: Check Stripe webhook logs and server logs

### Useful commands
```bash
# Check application logs
pm2 logs gaming-perks-shop

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check system resources
htop

# Check open ports
sudo netstat -tulpn
```

## Security Considerations

1. **Environment variables**: Never commit secrets to git
2. **Database**: Use RLS (Row Level Security) in Supabase
3. **API routes**: Implement proper authentication
4. **Rate limiting**: Consider implementing rate limiting for API routes
5. **Updates**: Keep server and dependencies updated

## Next Steps After Deployment

1. **Set up monitoring** (optional): Consider tools like Uptime Robot
2. **Analytics**: Add Google Analytics or similar
3. **Error tracking**: Consider Sentry for error monitoring
4. **CDN**: Consider Cloudflare for performance (optional)
5. **Backups**: Set up automated backups

## Development vs Production Workflow

### Continue developing locally
- Make changes on local machine
- Test thoroughly
- Push to git repository
- Deploy to production using the update commands above

This gives you the best of both worlds: stable production environment + flexible development. 