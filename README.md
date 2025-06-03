# Gaming Perks Shop

A web application for selling in-game perks and DLC items to players. Built with Next.js, Supabase, and Ko-fi for payments.

## Features

- User authentication (email/password and Google SSO)
- User profiles with in-game aliases and email updating
- Avatar selection and upload
- Product catalog for in-game perks with custom phrases
- Payment processing via Ko-fi (external redirect)
- Dashboard to view purchased perks
- Patch notes viewer with Infantry Online .nws syntax highlighting
- Admin panel for managing perks and products
- Donation tracking with Ko-fi webhook integration
- Responsive design for all device sizes

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Payment**: Ko-fi (external)

## Prerequisites

- Node.js (v16 or newer)
- npm or yarn
- Supabase account
- Ko-fi account (optional, for donation tracking)

## Setup

1. Clone this repository

```bash
git clone https://github.com/yourusername/gaming-perks-shop.git
cd gaming-perks-shop
```

2. Install dependencies

```bash
npm install
```

3. Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Ko-fi (Optional - for donation tracking)
KOFI_VERIFICATION_TOKEN=your-kofi-verification-token

# Site URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. Set up your Supabase database with the required tables (see schema below)

5. Start the development server

```bash
npm run dev
```

## Supabase Schema

Create the following tables in your Supabase database:

### profiles

```sql
create table profiles (
  id uuid references auth.users on delete cascade,
  email text not null,
  in_game_alias text,
  avatar_url text,
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id)
);

-- Enable RLS
alter table profiles enable row level security;

-- Create policies
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );
```

### products

```sql
create table products (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  price integer not null, -- Price in cents
  image text,
  active boolean default true,
  customizable boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table products enable row level security;

-- Create policies
create policy "Products are viewable by everyone."
  on products for select
  using ( true );

create policy "Products are insertable by admins."
  on products for insert
  using ( auth.uid() in (select id from profiles where is_admin = true) );

create policy "Products are updatable by admins."
  on products for update
  using ( auth.uid() in (select id from profiles where is_admin = true) );
```

### user_products

```sql
create table user_products (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  product_id uuid references products not null,
  phrase varchar(12), -- Custom phrase for customizable products
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, product_id)
);

-- Enable RLS
alter table user_products enable row level security;

-- Create policies
create policy "Users can view own purchases."
  on user_products for select
  using ( auth.uid() = user_id );

create policy "Purchases can be inserted by admins."
  on user_products for insert
  using ( auth.uid() in (select id from profiles where is_admin = true) );

create policy "Purchases are updatable by users and admins."
  on user_products for update
  using ( 
    auth.uid() = user_id OR 
    auth.uid() in (select id from profiles where is_admin = true) 
  );
```

### donation_transactions

```sql
create table donation_transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users,
  payment_method varchar(20) default 'kofi',
  amount_cents integer not null,
  currency varchar(3) default 'usd',
  status varchar(20) default 'completed',
  customer_email text,
  customer_name text,
  donation_message text,
  kofi_transaction_id varchar(255),
  kofi_message text,
  kofi_from_name varchar(255),
  kofi_email varchar(255),
  kofi_url varchar(500),
  created_at timestamptz default now(),
  completed_at timestamptz,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table donation_transactions enable row level security;

-- Create policies for donation_transactions
create policy "Users can view their own donations" on donation_transactions
  for select using (
    auth.uid() = user_id OR 
    auth.uid() in (select id from profiles where is_admin = true)
  );

create policy "System can insert donations" on donation_transactions
  for insert with check (true);

create policy "Admins can update donations" on donation_transactions
  for update using (
    auth.uid() in (select id from profiles where is_admin = true)
  );
```

## Payment Processing

This application uses Ko-fi for payment processing:

1. **Product Purchases**: Users are redirected to Ko-fi with pre-filled information
2. **Manual Verification**: Admins manually verify payments and activate perks
3. **Donation Tracking**: Ko-fi webhooks automatically track donations (optional)

### Ko-fi Setup (Optional)

1. Go to [Ko-fi Webhooks](https://ko-fi.com/manage/webhooks)
2. Set webhook URL to: `https://your-domain.com/api/kofi-webhook`
3. Set verification token (add to your environment variables)
4. Test the webhook with a small donation

## Features

### Custom Phrases for Perks
- Products can be marked as customizable
- Users can enter custom phrases (1-12 alphanumeric characters) during purchase
- Phrases are validated on both frontend and backend
- Useful for in-game identification and customization

### Email Address Updates
- Users can update their email addresses in their profile
- Email confirmation required for changes
- Seamless integration with Supabase Auth

### Patch Notes Viewer
- Displays Infantry Online .nws files with syntax highlighting
- Color-coded delimiters matching Notepad++ syntax highlighting
- Shows last modified date and file information
- Graceful error handling for missing files

### Admin Features
- View all donations with payment method filtering
- Export donation data to CSV
- Manually activate user purchases
- Manage products and pricing

## Deployment

This project can be deployed to any platform that supports Next.js applications, such as Vercel, Netlify, or any Linux server with Node.js installed.

### Deploy to Linux Server

1. Build the application:

```bash
npm run build
```

2. Start the server:

```bash
npm start
```

Consider using a process manager like PM2 to keep your application running:

```bash
npm install -g pm2
pm2 start npm --name "gaming-perks-shop" -- start
```

### Environment Variables for Production

Make sure to set these environment variables in your production environment:

```env
NEXT_PUBLIC_SUPABASE_URL=your-production-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
KOFI_VERIFICATION_TOKEN=your-kofi-verification-token
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## Development Notes

### Payment Flow
1. User selects product and custom phrase (if applicable)
2. User is redirected to Ko-fi with pre-filled information
3. User completes payment on Ko-fi
4. Admin receives notification and manually activates the perk
5. (Optional) Ko-fi webhook automatically records the donation

### Database Considerations
- All prices are stored in cents to avoid floating-point issues
- Payment method defaults to 'kofi' for new transactions
- Legacy Stripe data is preserved but marked as 'stripe' payment method

## License

[MIT](LICENSE)
