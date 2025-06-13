-- Integration Monitor Database Schema
-- Run these commands in your Supabase SQL editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create feeds table
CREATE TABLE feeds (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  integration_name TEXT NOT NULL,
  integration_alias TEXT,
  last_fetched TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create feed_items table
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  feed_id UUID REFERENCES feeds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  content TEXT NOT NULL,
  content_snippet TEXT,
  pub_date TIMESTAMP WITH TIME ZONE NOT NULL,
  integration_name TEXT NOT NULL,
  integration_alias TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_feeds_integration_name ON feeds(integration_name);
CREATE INDEX idx_feeds_created_at ON feeds(created_at DESC);
CREATE INDEX idx_feed_items_feed_id ON feed_items(feed_id);
CREATE INDEX idx_feed_items_pub_date ON feed_items(pub_date DESC);
CREATE INDEX idx_feed_items_integration_name ON feed_items(integration_name);

-- Create updated_at trigger for feeds table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_feeds_updated_at 
    BEFORE UPDATE ON feeds 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - Optional, adjust based on your needs
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your security requirements)
CREATE POLICY "Allow public read access on feeds" ON feeds FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on feeds" ON feeds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on feeds" ON feeds FOR UPDATE USING (true);

CREATE POLICY "Allow public read access on feed_items" ON feed_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on feed_items" ON feed_items FOR INSERT WITH CHECK (true); 