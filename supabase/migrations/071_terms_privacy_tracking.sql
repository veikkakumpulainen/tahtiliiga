-- Add terms and privacy acceptance tracking to profiles

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_accepted BOOLEAN DEFAULT FALSE;

-- Set acceptance timestamps for existing users to current time for migration purposes
UPDATE public.profiles
SET 
  terms_accepted_at = NOW(),
  privacy_accepted_at = NOW()
WHERE terms_accepted_at IS NULL AND privacy_accepted_at IS NULL;
