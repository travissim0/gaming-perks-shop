# Gaming Perks Shop

A web application for selling in-game perks and DLC items to players. Built with Next.js, Supabase, and Stripe.

## Features

- User authentication (email/password and Google SSO)
- User profiles with in-game aliases and email updating
- Avatar selection and upload
- Product catalog for in-game perks with custom phrases
- Payment processing with Stripe
- Dashboard to view purchased perks
- Patch notes viewer with Infantry Online .nws syntax highlighting
- Admin panel for managing perks and products
- Responsive design for all device sizes

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Payment**: Stripe

## Prerequisites

- Node.js (v16 or newer)
- npm or yarn
- Supabase account
- Stripe account

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

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Site URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. Set up your Supabase database with the required tables:

   - `profiles`: Store user profile information
   - `products`: Store available perks/products
   - `user_products`: Track user purchases

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
  price integer not null,
  price_id text not null,
  image text,
  active boolean default true,
  phrase varchar(12) check (phrase ~ '^[a-zA-Z0-9]*$'),
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
  stripe_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz default now(),
  unique(user_id, product_id)
);

-- Enable RLS
alter table user_products enable row level security;

-- Create policies
create policy "Users can view own purchases."
  on user_products for select
  using ( auth.uid() = user_id );

create policy "Purchases can be inserted through the API."
  on user_products for insert
  with check ( true ); -- This will be controlled via our API logic

create policy "Purchases are updatable by admins."
  on user_products for update
  using ( auth.uid() in (select id from profiles where is_admin = true) );
```

## New Features

### Custom Phrases for Perks
- Products can now include custom phrases (1-12 alphanumeric characters)
- Phrases are validated on both frontend and backend
- Useful for in-game identification and customization

### Email Address Updates
- Users can update their email addresses in their profile
- Email confirmation required for changes
- Seamless integration with Supabase Auth

### Patch Notes Viewer
- Displays Infantry Online .nws files with syntax highlighting
- Reads from local file path: `G:\Users\Travis\Desktop\New folder (2)\Infantry Online Map Folder\CTFPL Updates\ctfpl.nws`
- Color-coded delimiters matching Notepad++ syntax highlighting
- Shows last modified date and file information
- Graceful error handling for missing files

## Stripe Integration

1. Create products and prices in your Stripe dashboard.
2. When creating products in your Supabase database, use the corresponding Stripe Price ID for each product.

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

## License

[MIT](LICENSE)
