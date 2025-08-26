-- Create expenses tracking system for financial dashboard

-- Create expense categories enum
CREATE TYPE expense_category AS ENUM (
  'website_hosting',
  'server_hosting', 
  'ai_development_subscription',
  'ai_development_usage',
  'other'
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  expense_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  
  -- Additional metadata
  is_recurring BOOLEAN DEFAULT false,
  recurring_period VARCHAR(20), -- 'monthly', 'yearly', etc.
  provider VARCHAR(100), -- 'Cursor AI', 'AWS', 'Vercel', etc.
  notes TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at DESC);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create policies for expenses table
-- Only admins can view expenses
CREATE POLICY "Admins can view expenses" ON public.expenses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Only admins can create expenses
CREATE POLICY "Admins can create expenses" ON public.expenses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Only admins can update expenses
CREATE POLICY "Admins can update expenses" ON public.expenses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Only admins can delete expenses
CREATE POLICY "Admins can delete expenses" ON public.expenses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Create function to get financial overview
CREATE OR REPLACE FUNCTION get_financial_overview(
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  period TEXT,
  total_revenue DECIMAL(10,2),
  total_donations DECIMAL(10,2),
  total_orders DECIMAL(10,2),
  total_expenses DECIMAL(10,2),
  website_costs DECIMAL(10,2),
  server_costs DECIMAL(10,2),
  ai_subscription_costs DECIMAL(10,2),
  ai_usage_costs DECIMAL(10,2),
  other_costs DECIMAL(10,2),
  net_profit DECIMAL(10,2),
  profit_margin DECIMAL(5,2)
) AS $$
BEGIN
  -- Set default date range if not provided
  IF start_date IS NULL THEN
    start_date := DATE_TRUNC('year', CURRENT_DATE);
  END IF;
  
  IF end_date IS NULL THEN
    end_date := CURRENT_DATE;
  END IF;

  RETURN QUERY
  WITH revenue_data AS (
    -- Get donations data
    SELECT 
      DATE_TRUNC('month', created_at::date) as month,
      SUM(CASE WHEN amount IS NOT NULL THEN amount ELSE 0 END) as donations
    FROM donations 
    WHERE created_at::date BETWEEN start_date AND end_date
    GROUP BY DATE_TRUNC('month', created_at::date)
    
    UNION ALL
    
    -- Get orders data (if orders table exists)
    SELECT 
      DATE_TRUNC('month', created_at::date) as month,
      SUM(CASE WHEN total_amount IS NOT NULL THEN total_amount ELSE 0 END) as orders
    FROM orders 
    WHERE created_at::date BETWEEN start_date AND end_date
    GROUP BY DATE_TRUNC('month', created_at::date)
  ),
  expense_data AS (
    SELECT 
      DATE_TRUNC('month', expense_date) as month,
      category,
      SUM(amount) as total_amount
    FROM expenses 
    WHERE expense_date BETWEEN start_date AND end_date
    GROUP BY DATE_TRUNC('month', expense_date), category
  ),
  monthly_summary AS (
    SELECT 
      TO_CHAR(months.month, 'YYYY-MM') as period,
      COALESCE(SUM(CASE WHEN r.donations IS NOT NULL THEN r.donations ELSE 0 END), 0) as total_donations,
      COALESCE(SUM(CASE WHEN r.orders IS NOT NULL THEN r.orders ELSE 0 END), 0) as total_orders,
      COALESCE(SUM(CASE WHEN e.category = 'website_hosting' THEN e.total_amount ELSE 0 END), 0) as website_costs,
      COALESCE(SUM(CASE WHEN e.category = 'server_hosting' THEN e.total_amount ELSE 0 END), 0) as server_costs,
      COALESCE(SUM(CASE WHEN e.category = 'ai_development_subscription' THEN e.total_amount ELSE 0 END), 0) as ai_subscription_costs,
      COALESCE(SUM(CASE WHEN e.category = 'ai_development_usage' THEN e.total_amount ELSE 0 END), 0) as ai_usage_costs,
      COALESCE(SUM(CASE WHEN e.category = 'other' THEN e.total_amount ELSE 0 END), 0) as other_costs
    FROM (
      SELECT DISTINCT DATE_TRUNC('month', expense_date) as month FROM expenses 
      WHERE expense_date BETWEEN start_date AND end_date
      UNION
      SELECT DISTINCT DATE_TRUNC('month', created_at::date) as month FROM donations 
      WHERE created_at::date BETWEEN start_date AND end_date
      UNION
      SELECT DISTINCT DATE_TRUNC('month', created_at::date) as month FROM orders 
      WHERE created_at::date BETWEEN start_date AND end_date
    ) months
    LEFT JOIN revenue_data r ON r.month = months.month
    LEFT JOIN expense_data e ON e.month = months.month
    GROUP BY months.month
    ORDER BY months.month
  )
  SELECT 
    ms.period,
    (ms.total_donations + ms.total_orders) as total_revenue,
    ms.total_donations,
    ms.total_orders,
    (ms.website_costs + ms.server_costs + ms.ai_subscription_costs + ms.ai_usage_costs + ms.other_costs) as total_expenses,
    ms.website_costs,
    ms.server_costs,
    ms.ai_subscription_costs,
    ms.ai_usage_costs,
    ms.other_costs,
    ((ms.total_donations + ms.total_orders) - (ms.website_costs + ms.server_costs + ms.ai_subscription_costs + ms.ai_usage_costs + ms.other_costs)) as net_profit,
    CASE 
      WHEN (ms.total_donations + ms.total_orders) > 0 
      THEN ROUND((((ms.total_donations + ms.total_orders) - (ms.website_costs + ms.server_costs + ms.ai_subscription_costs + ms.ai_usage_costs + ms.other_costs)) / (ms.total_donations + ms.total_orders) * 100)::numeric, 2)
      ELSE 0 
    END as profit_margin
  FROM monthly_summary ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (will be restricted by RLS)
GRANT EXECUTE ON FUNCTION get_financial_overview TO authenticated;

-- Insert historical Cursor AI data
INSERT INTO public.expenses (category, description, amount, expense_date, provider, is_recurring, recurring_period, created_by) VALUES
-- 2024 data
('ai_development_subscription', 'Cursor AI Pro Subscription', 20.00, '2024-12-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),

-- 2025 data
('ai_development_subscription', 'Cursor AI Pro Subscription', 20.00, '2025-01-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 20.00, '2025-02-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 20.00, '2025-03-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 20.00, '2025-04-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 21.84, '2025-05-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 218.40, '2025-06-17', 'Cursor AI', true, 'yearly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 21.84, '2025-06-13', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 3.11, '2025-06-08', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 21.84, '2025-06-02', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_usage', 'Cursor AI Usage Tokens - June', 34.96, '2025-06-30', 'Cursor AI', false, null, (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 218.40, '2025-07-17', 'Cursor AI', true, 'yearly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 16.34, '2025-07-07', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_usage', 'Cursor AI Usage Tokens - July', 4.51, '2025-07-31', 'Cursor AI', false, null, (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('ai_development_subscription', 'Cursor AI Pro Subscription', 13.99, '2025-08-14', 'Cursor AI', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1));

-- Add default recurring monthly costs (you can adjust these)
INSERT INTO public.expenses (category, description, amount, expense_date, provider, is_recurring, recurring_period, created_by) VALUES
-- Website hosting costs
('website_hosting', 'Website Hosting - Monthly', 25.00, '2024-12-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-01-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-02-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-03-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-04-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-05-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-06-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-07-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('website_hosting', 'Website Hosting - Monthly', 25.00, '2025-08-01', 'Hosting Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),

-- Linux server costs
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2024-12-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-01-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-02-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-03-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-04-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-05-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-06-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-07-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1)),
('server_hosting', 'Linux Server Hosting - Monthly', 25.61, '2025-08-01', 'Server Provider', true, 'monthly', (SELECT id FROM profiles WHERE is_admin = true LIMIT 1));
