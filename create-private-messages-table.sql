-- Create private_messages table
CREATE TABLE IF NOT EXISTS private_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL DEFAULT 'No Subject',
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_recipient ON private_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_unread ON private_messages(recipient_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_private_messages_created_at ON private_messages(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can read messages they sent or received
CREATE POLICY "Users can read their own messages" ON private_messages
    FOR SELECT USING (
        auth.uid() = sender_id OR auth.uid() = recipient_id
    );

-- Users can insert messages as sender
CREATE POLICY "Users can send messages" ON private_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id
    );

-- Users can update messages they received (to mark as read)
CREATE POLICY "Recipients can update messages" ON private_messages
    FOR UPDATE USING (
        auth.uid() = recipient_id
    );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update updated_at
DROP TRIGGER IF EXISTS update_private_messages_updated_at ON private_messages;
CREATE TRIGGER update_private_messages_updated_at
    BEFORE UPDATE ON private_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 