-- Create match_report_comments table
CREATE TABLE IF NOT EXISTS match_report_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_report_id UUID NOT NULL REFERENCES match_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_match_report_comments_report_id ON match_report_comments(match_report_id);
CREATE INDEX IF NOT EXISTS idx_match_report_comments_created_at ON match_report_comments(created_at);

-- Enable RLS
ALTER TABLE match_report_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can read comments
CREATE POLICY "Anyone can read comments"
  ON match_report_comments FOR SELECT
  USING (true);

-- Authenticated users can insert their own comments
CREATE POLICY "Users can insert own comments"
  ON match_report_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON match_report_comments FOR DELETE
  USING (auth.uid() = user_id);
