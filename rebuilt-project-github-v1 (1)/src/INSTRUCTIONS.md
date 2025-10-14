---
title: "ZOGU Solutions: Beginner's Setup & Deployment Guide"
---

# ZOGU Solutions: Beginner's Setup & Deployment Guide

Welcome! This guide will walk you through setting up and deploying your ZOGU Solutions application. We'll use a simple "drag and drop" method, so no complex tools are needed.

Let's get started!

---

## Part 1: Setting Up Your Backend (The App's "Brain")

Your app needs a "brain" to store all its data (users, products, invoices, etc.). We will use a free service called **Supabase** for this.

### Step 1.1: Create a Supabase Account and Project

1.  Go to [supabase.com](https://supabase.com) and click **"Start your project"**.
2.  Sign up for a new account (the free plan is perfect).
3.  Once you're logged in, click **"New project"**.
4.  Give your project a **Name** (e.g., `zogu-solutions-app`).
5.  Create a secure **Database Password** (save this somewhere safe!).
6.  Choose a **Region** that is closest to you.
7.  Click **"Create new project"**. It will take a few minutes to set up.

### Step 1.2: Get Your API Keys

These keys are like a secret password that lets your app talk to its "brain".

1.  After your project is ready, look for the **Settings** icon (a gear) on the left menu and click it.
2.  In the settings menu, click on **API**.
3.  You will see two important things under "Project API keys":
    *   **Project URL:** A web address that looks like `https://xxxxxxxx.supabase.co`
    *   **anon public Key:** A very long string of random characters.
4.  **Keep this page open!** We will need to copy these two keys in Part 2.

### Step 1.3: Set Up the Database Structure

This step tells your app's brain what kind of information to store (like tables for `products`, `invoices`, etc.). We'll do this by running a special script.

1.  In your Supabase project, look for the **SQL Editor** icon (looks like a database with `SQL` on it) on the left menu and click it.
2.  Click **"+ New query"**.
3.  Go to the file named `supabase_schema.sql` that was provided with the project code. Open it, select ALL the text inside, and copy it.
4.  Paste the entire script into the Supabase SQL Editor.
5.  Click the green **"RUN"** button.

If everything is correct, you'll see a "Success. No rows returned" message. Your database is now perfectly structured for the app!

### Step 1.4: **CRITICAL** - Secure Your Database with Row Level Security

This is the most important step to make your application secure and functional for non-admin users. This script enables a "firewall" on your data, ensuring users can only see and manage data from their own organization. It also includes functions required for data privacy (GDPR/DSGVO) compliance.

1.  In your Supabase **SQL Editor**, click **"+ New query"** again.
2.  Copy the **entire** SQL script below and paste it into the editor.
3.  Click the green **"RUN"** button. This script is safe to run multiple times.

```sql
-- === PART 0: ENABLE REQUIRED EXTENSIONS & PERMISSIONS ===
-- Enables the ability for database functions to make HTTP requests (e.g., to call Edge Functions for automations).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- CRITICAL: Grant usage of the 'net' schema to the 'postgres' role.
-- SECURITY DEFINER functions run as the 'postgres' user, which needs this permission to make outbound HTTP requests.
GRANT USAGE ON SCHEMA net TO postgres;


-- === PART 1: HELPER FUNCTIONS FOR SECURITY ===
-- Gets the organization ID of the currently logged-in user.
CREATE OR REPLACE FUNCTION get_my_org_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT org_id FROM public.profiles WHERE id = auth.uid(); $$;
-- Checks if the current user is a super_admin.
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'); $$;
-- Gets the role of the currently logged-in user.
CREATE OR REPLACE FUNCTION get_my_role() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT role FROM public.profiles WHERE id = auth.uid(); $$;


-- === PART 1B: ADD COLUMNS FOR PREMIUM & NEW FEATURES ===
-- Adds columns to the organizations table for Stripe integration.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_payment_gateway_enabled BOOLEAN DEFAULT FALSE;
-- Adds column for DATEV Export feature
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_datev_export_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS datev_settings JSONB;
-- Adds column for Email Sending feature
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_email_sending_enabled BOOLEAN DEFAULT FALSE;
-- Adds column for Visit Reminder feature
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_visit_reminder_enabled BOOLEAN DEFAULT FALSE;
-- Adds column for Custom Text Blocks feature
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_text_blocks_enabled BOOLEAN DEFAULT FALSE;
-- NEW: Adds column for user limits per organization
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5;


-- Adds column to customers table for Visit Reminder feature
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_reminder_relevant BOOLEAN DEFAULT FALSE;

-- NEW: Add type and all-day flag for appointments (vacations, etc.)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'standard';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT FALSE;

-- NEW: Make customer optional for appointments
ALTER TABLE public.appointments ALTER COLUMN customer_id DROP NOT NULL;

-- Adds columns to the invoices table for Stripe payment tracking and visit conversion.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_link_url TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS visit_id BIGINT;

-- NEW: Add internal_notes to visits table
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS internal_notes TEXT;
-- NEW: Add signature_date to visits table
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS signature_date TIMESTAMPTZ;


-- === NEW: Add columns to products table for stock management ===
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_status TEXT DEFAULT 'Available'::text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS minimum_stock_level INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS restock_date DATE;

-- === NEW: Add columns for product/service differentiation ===
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'good'::text NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT;

-- === NEW: Add internal/customer notes fields to invoices and quotes ===
-- Update Invoices Table
DO $$
BEGIN
  -- First, check if the old 'notes' column exists before trying to rename it
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='notes') THEN
    ALTER TABLE public.invoices RENAME COLUMN notes TO customer_notes;
  END IF;
END $$;
-- Add the new column for internal notes if it doesn't already exist
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Update Quotes Table
DO $$
BEGIN
  -- First, check if the old 'notes' column exists before trying to rename it
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='notes') THEN
    ALTER TABLE public.quotes RENAME COLUMN notes TO customer_notes;
  END IF;
END $$;
-- Add the new column for internal notes if it doesn't already exist
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS internal_notes TEXT;


-- === NEW: Add expense_id to link expenses to line items ===
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS expense_id BIGINT;
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS expense_id BIGINT;


-- === PART 1C: ADD EMAIL LOGGING TABLE ===
-- Creates a table to log all outgoing emails for customer timeline tracking.
CREATE TABLE IF NOT EXISTS public.email_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    org_id uuid NOT NULL,
    customer_id integer NOT NULL,
    sent_by_user_id uuid NOT NULL,
    document_type text NOT NULL,
    related_document_id text NOT NULL,
    subject text NOT NULL,
    CONSTRAINT email_logs_pkey PRIMARY KEY (id),
    CONSTRAINT email_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
    CONSTRAINT email_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT email_logs_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- === PART 1D: CUSTOM TEXT BLOCKS TABLE ===
CREATE TABLE IF NOT EXISTS public.text_blocks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    applicable_to text[] NOT NULL,
    CONSTRAINT text_blocks_pkey PRIMARY KEY (id),
    CONSTRAINT text_blocks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    CONSTRAINT text_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- === NEW: PART 1E: HELP CONTENT TABLE ===
CREATE TABLE IF NOT EXISTS public.help_content (
    page_key text NOT NULL,
    content_de text NULL,
    content_al text NULL,
    updated_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT help_content_pkey PRIMARY KEY (page_key)
);

-- === NEW: PART 1E BIS: ORGANIZATION INVITATIONS TABLE ===
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    org_name text NOT NULL,
    max_users integer NOT NULL DEFAULT 5,
    created_by uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- pending, accepted
    accepted_by_user_id uuid NULL,
    accepted_at timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT organization_invitations_pkey PRIMARY KEY (id),
    CONSTRAINT organization_invitations_code_key UNIQUE (code),
    CONSTRAINT organization_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT organization_invitations_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);


-- === PART 1F: ADD FOREIGN KEY CONSTRAINTS for data consistency ===
-- These constraints formalize the relationship between tables and are critical for Supabase's API to auto-detect joins.
-- This script is idempotent (safe to re-run).

-- Link expenses to the user who created them.
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;
ALTER TABLE public.expenses
ADD CONSTRAINT expenses_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles (id)
ON DELETE SET NULL;

-- Link invoice items to an expense.
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_expense_id_fkey;
ALTER TABLE public.invoice_items
ADD CONSTRAINT invoice_items_expense_id_fkey
FOREIGN KEY (expense_id)
REFERENCES public.expenses(id)
ON DELETE SET NULL;

-- Link quote items to an expense.
ALTER TABLE public.quote_items DROP CONSTRAINT IF EXISTS quote_items_expense_id_fkey;
ALTER TABLE public.quote_items
ADD CONSTRAINT quote_items_expense_id_fkey
FOREIGN KEY (expense_id)
REFERENCES public.expenses(id)
ON DELETE SET NULL;

-- Link invoices to the visit they were generated from.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_visit_id_fkey;
ALTER TABLE public.invoices
ADD CONSTRAINT invoices_visit_id_fkey
FOREIGN KEY (visit_id)
REFERENCES public.visits(id)
ON DELETE SET NULL;

-- Link tasks to the user they are assigned to.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;
ALTER TABLE public.tasks
ADD CONSTRAINT tasks_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles (id)
ON DELETE SET NULL;


-- === NEW: PART 1G: ROBUSTNESS FIX for help_content TABLE ===
-- This section ensures the help_content table is correctly structured,
-- resolving potential issues from earlier schema versions where a primary key
-- might have been missing, allowing duplicate entries.
DO $$
BEGIN
    -- This check prevents errors if the table doesn't exist yet on a fresh install.
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'help_content') THEN
        -- 1. Temporarily drop the PK to handle data cleanup. This is safe because we re-add it.
        ALTER TABLE public.help_content DROP CONSTRAINT IF EXISTS help_content_pkey;

        -- 2. Delete all duplicate rows based on page_key, keeping only the one with the highest internal ctid.
        DELETE FROM public.help_content a
        WHERE a.ctid < (
          SELECT max(b.ctid)
          FROM public.help_content b
          WHERE a.page_key = b.page_key
        );

        -- 3. Re-create the primary key to enforce uniqueness from now on.
        ALTER TABLE public.help_content ADD CONSTRAINT help_content_pkey PRIMARY KEY (page_key);
    END IF;
END $$;


-- === NEW: PART 1H: LEGAL CONTENT TABLE ===
CREATE TABLE IF NOT EXISTS public.legal_content (
    key text NOT NULL,
    content_de text NULL,
    content_al text NULL,
    updated_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT legal_content_pkey PRIMARY KEY (key)
);
-- Seed with initial empty values (important for the UI to have something to update)
INSERT INTO public.legal_content (key, content_de, content_al) VALUES
('agb', '', ''),
('datenschutz', '', '')
ON CONFLICT (key) DO NOTHING;


-- === NEW: PART 1I: DSGVO/GDPR COMPLIANCE FUNCTIONS & CONSTRAINTS ===
-- ==============================================================================
-- DSGVO/GDPR COMPLIANCE SETUP
-- ==============================================================================
-- The following section is critical for data privacy compliance.
-- It adds 'ON DELETE CASCADE' to all tables related to a customer. This ensures that
-- when a customer is deleted, ALL of their associated data (invoices, quotes, visits, etc.)
-- is automatically and permanently removed from the database.
--
-- It also creates two secure functions for the frontend:
--   - export_customer_data: Gathers all data for a customer into a single JSON file.
--   - delete_customer_data: Performs the secure deletion of a customer and their data.
-- ==============================================================================

-- Add ON DELETE CASCADE to customer foreign keys for easier data deletion.
-- This is idempotent (safe to re-run) and ensures that when a customer is deleted,
-- all their related records (invoices, quotes, etc.) are also automatically deleted.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_customer_id_fkey;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_customer_id_fkey;
ALTER TABLE public.visits ADD CONSTRAINT visits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_customer_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_customer_id_fkey;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- RPC Function to delete all data for a customer.
CREATE OR REPLACE FUNCTION delete_customer_data(p_customer_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Critical: allows bypassing RLS for deletion after permission check.
AS $$
DECLARE
  customer_org_id uuid;
BEGIN
  -- 1. Permission Check: Ensure the caller is a super admin or an admin of the customer's org.
  SELECT org_id INTO customer_org_id FROM public.customers WHERE id = p_customer_id;

  IF NOT (is_super_admin() OR (get_my_role() = 'admin' AND get_my_org_id() = customer_org_id)) THEN
    RAISE EXCEPTION 'Insufficient permissions: You must be a super admin or an admin of this organization to delete customer data.';
  END IF;

  -- 2. Delete Customer Record.
  --    Because of 'ON DELETE CASCADE' on all related tables, this will trigger a full cleanup.
  DELETE FROM public.customers WHERE id = p_customer_id;
END;
$$;

-- RPC Function to export all data for a customer as a JSON object.
CREATE OR REPLACE FUNCTION export_customer_data(p_customer_id bigint)
RETURNS jsonb
LANGUAGE sql
AS $$
  -- Permission check is implicitly handled by RLS on the SELECTs,
  -- as this function does not need SECURITY DEFINER.
  -- An admin from another org will simply get an empty result.
  SELECT jsonb_build_object(
    'customer_details', to_jsonb(c.*),
    'invoices', (SELECT jsonb_agg(to_jsonb(i.*) || jsonb_build_object('items', (SELECT jsonb_agg(it.*) FROM invoice_items it WHERE it.invoice_id = i.id))) FROM invoices i WHERE i.customer_id = c.id),
    'quotes', (SELECT jsonb_agg(to_jsonb(q.*) || jsonb_build_object('items', (SELECT jsonb_agg(qt.*) FROM quote_items qt WHERE qt.quote_id = q.id))) FROM quotes q WHERE q.customer_id = c.id),
    'visits', (SELECT jsonb_agg(to_jsonb(v.*) || jsonb_build_object('products', (SELECT jsonb_agg(vp.*) FROM visit_products vp WHERE vp.visit_id = v.id), 'expenses', (SELECT jsonb_agg(ve.*) FROM visit_expenses ve WHERE ve.visit_id = v.id))) FROM visits v WHERE v.customer_id = c.id),
    'tasks', (SELECT jsonb_agg(t.*) FROM tasks t WHERE t.customer_id = c.id),
    'appointments', (SELECT jsonb_agg(a.*) FROM appointments a WHERE a.customer_id = c.id),
    'email_logs', (SELECT jsonb_agg(el.*) FROM email_logs el WHERE el.customer_id = c.id)
  )
  FROM customers c
  WHERE c.id = p_customer_id;
$$;


-- === PART 2: ENABLE ROW LEVEL SECURITY (RLS) FOR ALL TABLES ===
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_content ENABLE ROW LEVEL SECURITY;


-- === PART 3: CREATE RLS POLICIES ===

-- Policy: Special RLS for the `organizations` table.
-- Rule: Users can see/manage their own organization, and super admins can see/manage all.
-- This policy is separate because the `organizations` table uses `id` as the org identifier, not `org_id`.
DROP POLICY IF EXISTS "Users can manage their own organization" ON public.organizations;
CREATE POLICY "Users can manage their own organization" ON public.organizations FOR ALL
  USING (is_super_admin() OR get_my_org_id() = id)
  WITH CHECK (is_super_admin() OR get_my_org_id() = id);

-- Policy: Generic multi-tenant policy for tables with an 'org_id'.
-- Rule: Users can manage data in their org, and super_admins can do anything.
CREATE OR REPLACE FUNCTION create_org_rls_policy(table_name text) RETURNS void AS $$ BEGIN EXECUTE format(' DROP POLICY IF EXISTS "Users can manage data in their own organization" ON public.%I; CREATE POLICY "Users can manage data in their own organization" ON public.%I FOR ALL USING (is_super_admin() OR get_my_org_id() = org_id) WITH CHECK (is_super_admin() OR get_my_org_id() = org_id); ', table_name, table_name); END; $$ LANGUAGE plpgsql;
-- Apply the generic policy (organizations table is now handled separately)
SELECT create_org_rls_policy(table_name) FROM (VALUES ('customers'), ('products'), ('invoices'), ('quotes'), ('expenses'), ('tasks'), ('appointments'), ('visits'), ('user_invitations'), ('role_permissions'), ('text_blocks')) AS t(table_name);
DROP FUNCTION create_org_rls_policy(text);

-- Policy: Special RLS for related items (e.g., invoice_items) that link to an org via a parent.
CREATE OR REPLACE FUNCTION create_related_item_policy(table_name text, parent_table text, fkey_column text) RETURNS void AS $$ BEGIN EXECUTE format(' DROP POLICY IF EXISTS "Users can manage related items in their org" ON public.%I; CREATE POLICY "Users can manage related items in their org" ON public.%I FOR ALL USING (is_super_admin() OR EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.org_id = get_my_org_id())) WITH CHECK (is_super_admin() OR EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.org_id = get_my_org_id())); ', table_name, table_name, parent_table, table_name, fkey_column, parent_table, table_name, fkey_column); END; $$ LANGUAGE plpgsql;
-- Apply the related item policy
SELECT create_related_item_policy('invoice_items', 'invoices', 'invoice_id');
SELECT create_related_item_policy('quote_items', 'quotes', 'quote_id');
SELECT create_related_item_policy('visit_products', 'visits', 'visit_id');
SELECT create_related_item_policy('visit_expenses', 'visits', 'visit_id');
DROP FUNCTION create_related_item_policy(text, text, text);

-- ==============================================================================
-- FIX: REBUILT RLS POLICIES FOR 'profiles' TABLE TO PREVENT RECURSIVE ERRORS
-- AND TO ALLOW ADMINS TO EDIT USERS IN THEIR ORG
-- ==============================================================================

-- 1. Drop any old, potentially conflicting policies first to make this script re-runnable.
DROP POLICY IF EXISTS "Users can view/manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can insert profiles" ON public.profiles;


-- 2. Create new, non-recursive SELECT policies. This is the core of the fix.
--    This allows helper functions like get_my_org_id() to work correctly.
--    Policies for the same command (SELECT) are additive and are OR'd together.

--    Policy to allow users to see their own profile record.
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

--    Policy to allow users to see other profiles that belong to the same organization.
CREATE POLICY "Users can view profiles in their organization" ON public.profiles
  FOR SELECT
  USING (org_id = get_my_org_id());
  
--    Policy to allow super admins to see all profiles.
CREATE POLICY "Super admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (is_super_admin());


-- 3. Re-create explicit policies for modification, which is safer than 'FOR ALL'.

--    An admin/key_user can update profiles within their organization.
--    A regular user can only update their own profile.
CREATE POLICY "Users can update profiles" ON public.profiles
  FOR UPDATE
  USING (is_super_admin() OR org_id = get_my_org_id())
  WITH CHECK (
    is_super_admin() OR
    -- Admins/key_users can update any profile in their organization
    (get_my_role() IN ('admin', 'key_user') AND org_id = get_my_org_id()) OR
    -- A regular user can only update their own profile details
    (auth.uid() = id)
  );

--    Only super admins should be able to delete profiles directly.
CREATE POLICY "Super admins can delete profiles" ON public.profiles
  FOR DELETE
  USING (is_super_admin());

--    Block manual inserts for non-super-admins (inserts are handled by the auth trigger).
CREATE POLICY "Super admins can insert profiles" ON public.profiles
  FOR INSERT
  WITH CHECK (is_super_admin());
-- ==============================================================================
-- END OF 'profiles' RLS FIX
-- ==============================================================================


-- Policy: RLS for the `notifications` table.
-- Rule: Users can only manage their own notifications. This fixes the "Clear All" button.
DROP POLICY IF EXISTS "Users can manage their own notifications" ON public.notifications;
CREATE POLICY "Users can manage their own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy: RLS for the new `email_logs` table.
DROP POLICY IF EXISTS "Users can manage data in their own organization" ON public.email_logs;
CREATE POLICY "Users can manage data in their own organization" ON public.email_logs FOR ALL
  USING (is_super_admin() OR get_my_org_id() = org_id)
  WITH CHECK (is_super_admin() OR get_my_org_id() = org_id);

-- Policy: RLS for the new `help_content` table.
DROP POLICY IF EXISTS "Super Admins can manage help content" ON public.help_content;
CREATE POLICY "Super Admins can manage help content" ON public.help_content
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Authenticated users can read help content" ON public.help_content;
-- FIX: Use `TO authenticated USING (true)` which is the standard Supabase pattern for allowing read access to any logged-in user.
-- The previous `USING (auth.role() = 'authenticated')` can be unreliable in some contexts. This change makes the policy more robust.
CREATE POLICY "Authenticated users can read help content" ON public.help_content
  FOR SELECT
  TO authenticated
  USING (true);

-- NEW: RLS for organization_invitations table
DROP POLICY IF EXISTS "Super admins can manage organization invitations" ON public.organization_invitations;
CREATE POLICY "Super admins can manage organization invitations" ON public.organization_invitations
    FOR ALL
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

-- NEW: RLS for legal_content table
DROP POLICY IF EXISTS "Super Admins can manage legal content" ON public.legal_content;
CREATE POLICY "Super Admins can manage legal content" ON public.legal_content
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Authenticated users can read legal content" ON public.legal_content;
CREATE POLICY "Authenticated users can read legal content" ON public.legal_content
  FOR SELECT
  TO authenticated
  USING (true);


-- === PART 3B: NEW USER TRIGGER FOR INVITATION SYSTEM ===
-- This function replaces the old default behavior of creating a new organization
-- for every sign-up. Now, registration is only possible with a valid invitation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org_invitation public.organization_invitations;
  user_inv public.user_invitations;
  new_org_id uuid;
  invitation_code text;
BEGIN
  -- Extract invitation_code from metadata if present
  invitation_code := new.raw_user_meta_data ->> 'invitation_code';

  -- CASE 1: Sign up with an organization invitation code (creates a new org + admin)
  IF invitation_code IS NOT NULL THEN
    SELECT * INTO org_invitation
    FROM public.organization_invitations
    WHERE code = invitation_code AND status = 'pending';

    IF org_invitation IS NULL THEN
      RAISE EXCEPTION 'Invalid or already used invitation code.';
    END IF;

    -- Create a new organization
    INSERT INTO public.organizations (name, max_users)
    VALUES (org_invitation.org_name, org_invitation.max_users)
    RETURNING id INTO new_org_id;

    -- Create the user's profile as an admin of the new org
    INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (new.id, new_org_id, new.raw_user_meta_data ->> 'full_name', new.email, 'admin');

    -- Update the invitation to mark it as accepted
    UPDATE public.organization_invitations
    SET status = 'accepted', accepted_by_user_id = new.id, accepted_at = now()
    WHERE id = org_invitation.id;

    RETURN new;

  -- CASE 2: Sign up via an email invitation to an existing org
  ELSE
    SELECT * INTO user_inv
    FROM public.user_invitations
    WHERE invited_user_email = new.email AND status = 'pending';

    IF user_inv IS NULL THEN
      RAISE EXCEPTION 'No pending invitation found for this email address. Registration is by invitation only.';
    END IF;
    
    -- Check if org has space for new user
    DECLARE
        current_users integer;
        max_users_for_org integer;
    BEGIN
        SELECT COUNT(*), (SELECT o.max_users FROM public.organizations o WHERE o.id = user_inv.org_id)
        INTO current_users, max_users_for_org
        FROM public.profiles p WHERE p.org_id = user_inv.org_id;

        IF current_users >= max_users_for_org THEN
            RAISE EXCEPTION 'Organization has reached its maximum user limit.';
        END IF;
    END;

    -- Create the user's profile
    INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (new.id, user_inv.org_id, new.raw_user_meta_data ->> 'full_name', new.email, user_inv.role);

    -- Update the invitation to mark it as accepted
    UPDATE public.user_invitations
    SET status = 'accepted'
    WHERE id = user_inv.id;
    
    RETURN new;
  END IF;
END;
$$;

-- Create or replace the trigger on the auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- === PART 4: STOCK MANAGEMENT FUNCTIONS & TRIGGERS ===

-- Function to create low stock notifications for relevant users in an organization.
CREATE OR REPLACE FUNCTION create_low_stock_notification(p_product_id BIGINT, p_org_id UUID, p_product_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, org_id, title, body, type, related_entity_path, related_entity_id)
  SELECT
    id,
    p_org_id,
    'Low Stock Warning',
    'Stock for "' || p_product_name || '" is low.',
    'generic',
    '/inventory',
    p_product_id::text
  FROM public.profiles
  WHERE org_id = p_org_id AND role IN ('admin', 'key_user');
END;
$$;

-- Trigger function to handle changes to a product's stock level.
CREATE OR REPLACE FUNCTION handle_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_status TEXT;
BEGIN
  -- Only run if stock_level was actually updated
  IF OLD.stock_level IS DISTINCT FROM NEW.stock_level THEN

    -- 1. Determine the new automatic stock status (if not manually set to 'Available Soon')
    IF NEW.stock_status <> 'Available Soon' THEN
      IF NEW.stock_level <= 0 THEN
        new_status := 'Not Available';
      ELSIF NEW.stock_level <= NEW.minimum_stock_level THEN
        new_status := 'Low';
      ELSE
        new_status := 'Available';
      END IF;
      NEW.stock_status := new_status;
    END IF;

    -- 2. Check if the stock has just crossed the minimum threshold
    IF OLD.stock_level > OLD.minimum_stock_level AND NEW.stock_level <= NEW.minimum_stock_level THEN
      -- Create a notification for admins and key users
      PERFORM create_low_stock_notification(NEW.id, NEW.org_id, NEW.name);
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger on the products table.
DROP TRIGGER IF EXISTS on_product_stock_update ON public.products;
CREATE TRIGGER on_product_stock_update
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION handle_stock_change();


-- RPC function for the frontend to atomically update multiple product stock levels.
CREATE OR REPLACE FUNCTION update_stock_levels(updates jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    item jsonb;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(updates)
    LOOP
        UPDATE public.products
        SET stock_level = stock_level - (item->>'quantity_delta')::numeric
        WHERE id = (item->>'product_id')::int;
    END LOOP;
END;
$$;


-- === PART 5: TIMESTAMP UPDATE TRIGGERS ===
CREATE OR REPLACE FUNCTION public.handle_help_content_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_help_content_update ON public.help_content;
CREATE TRIGGER on_help_content_update
BEFORE UPDATE ON public.help_content
FOR EACH ROW
EXECUTE FUNCTION public.handle_help_content_update();

-- NEW: Trigger for legal_content table
CREATE OR REPLACE FUNCTION public.handle_legal_content_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_legal_content_update ON public.legal_content;
CREATE TRIGGER on_legal_content_update
BEFORE UPDATE ON public.legal_content
FOR EACH ROW
EXECUTE FUNCTION public.handle_legal_content_update();


-- === PART 6: CHANGELOG & AUDIT TRAIL SYSTEM ===
-- This part sets up a comprehensive audit trail for key tables.

-- Step 6.1: Create the changelog table
CREATE TABLE IF NOT EXISTS public.changelog (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    user_id uuid NULL,
    user_email text NULL,
    org_id uuid NULL,
    action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    table_name text NOT NULL,
    record_id text NOT NULL,
    changes jsonb NULL,
    CONSTRAINT changelog_pkey PRIMARY KEY (id)
);
-- Add indexes for faster querying
CREATE INDEX IF NOT EXISTS changelog_record_table_idx ON public.changelog(record_id, table_name);
CREATE INDEX IF NOT EXISTS changelog_org_id_idx ON public.changelog(org_id);

-- Step 6.2: Create the function to log changes
CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER AS $$
DECLARE
    changed_fields jsonb := '{}'::jsonb;
    _record_id text;
    r record;
BEGIN
    -- Determine record_id based on data type (bigint vs uuid)
    IF TG_OP = 'DELETE' THEN
        _record_id := OLD.id::text;
    ELSE
        _record_id := NEW.id::text;
    END IF;

    -- Build the 'changes' JSONB object
    IF (TG_OP = 'UPDATE') THEN
        FOR r IN SELECT key, value FROM jsonb_each_text(to_jsonb(OLD)) LOOP
            -- Check if the value has changed
            IF (to_jsonb(NEW) ->> r.key) IS DISTINCT FROM r.value THEN
                changed_fields := changed_fields || jsonb_build_object(
                    r.key,
                    jsonb_build_object('old', r.value, 'new', to_jsonb(NEW) ->> r.key)
                );
            END IF;
        END LOOP;
        -- If no fields have changed, do not log
        IF changed_fields = '{}'::jsonb THEN
            RETURN NEW;
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        changed_fields := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        changed_fields := to_jsonb(OLD);
    END IF;

    -- Insert into changelog table
    INSERT INTO public.changelog (user_id, user_email, org_id, action, table_name, record_id, changes)
    VALUES (
        auth.uid(),
        auth.jwt() ->> 'email',
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.org_id ELSE OLD.org_id END,
        TG_OP,
        TG_TABLE_NAME,
        _record_id,
        changed_fields
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6.3: Create a helper function to apply the trigger to multiple tables
CREATE OR REPLACE FUNCTION create_changelog_trigger(table_name text) RETURNS void AS $$
BEGIN
    EXECUTE format('DROP TRIGGER IF EXISTS on_%I_change ON public.%I;', table_name, table_name);
    EXECUTE format('
        CREATE TRIGGER on_%I_change
        AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION log_changes();
    ', table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Step 6.4: Apply the trigger to all relevant tables
SELECT create_changelog_trigger(table_name) FROM (VALUES
    ('customers'),
    ('invoices'),
    ('quotes'),
    ('visits'),
    ('tasks'),
    ('expenses'),
    ('appointments'),
    ('products'),
    ('text_blocks')
) AS t(table_name);

-- Clean up the helper function
DROP FUNCTION create_changelog_trigger(text);

-- Step 6.5: Enable RLS on the new changelog table
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;

-- Step 6.6: Create RLS policy for changelog
DROP POLICY IF EXISTS "Users can manage changelogs in their own organization" ON public.changelog;
CREATE POLICY "Users can manage changelogs in their own organization" ON public.changelog
FOR SELECT USING (is_super_admin() OR get_my_org_id() = org_id);

-- === PART 7: SEED INITIAL DATA ===
-- Seed the help_content table with initial content (safe to re-run)
-- Dollar quoting ($$) is used to handle multi-line strings with special characters.
INSERT INTO public.help_content (page_key, content_de, content_al) VALUES
('dashboard', $$
### What you can do here
This is your main dashboard, giving you a quick overview of your business activities. You can:
- **Quickly create** new documents like invoices, quotes, or tasks using the buttons at the top.
- See key statistics like **Total Revenue**, **Unpaid Invoices**, and **Pending Quotes**. Clicking these cards takes you to the respective pages with pre-applied filters.
- Check the **Action Center** for urgent items. Items appear here automatically, such as invoices that are past their due date.
- Use the **Dispatch Hub** to see today's team workload and any unassigned tasks, helping you plan your day.
- View a **Sales Overview** chart to track your revenue throughout the year. Each colored segment in a bar represents a different invoice status (e.g., paid, sent, overdue).
- See a list of your **Recent Invoices** for quick access.
$$, $$
### Çfarë mund të bëni këtu
Ky është paneli juaj kryesor, që ju jep një pasqyrë të shpejtë të aktiviteteve tuaja të biznesit. Ju mund të:
- **Krijoni shpejt** dokumente të reja si fatura, oferta ose detyra duke përdorur butonat në krye.
- Shikoni statistikat kryesore si **Të Ardhurat Totale**, **Faturat e Papaguara** dhe **Ofertat në Pritje**. Klikimi mbi këto karta ju çon në faqet përkatëse me filtra të paracaktuar.
- Kontrolloni **Qendrën e Veprimit** për çështje urgjente. Artikujt shfaqen këtu automatikisht, si faturat që kanë kaluar afatin e pagesës.
- Përdorni **Qendrën e Dispozicionit** për të parë ngarkesën e punës së ekipit për sot dhe detyrat e pacaktuara, duke ju ndihmuar të planifikoni ditën tuaj.
- Shfaqni një **Pasqyrë të Shitjeve** në grafik për të ndjekur të ardhurat tuaja gjatë vitit. Çdo segment me ngjyrë në një shirit përfaqëson një status të ndryshëm të faturës (p.sh., e paguar, e dërguar, e vonuar).
- Shikoni një listë të **Faturave tuaja të Fundit** për qasje të shpejtë.
$$),
('inventory_list', $$
### What you can do here
This is the inventory page where you manage all your products and services. You can:
- **View, search, and sort** your entire catalog.
- **Add** new items using the 'New Product' button.
- **Edit, copy, or delete** existing items using the icons on each row.

### How it works
- **Products vs. Services:** You can define an item as a 'Good' (a physical product) or a 'Service'.
- **Stock Tracking:** For 'Goods', you can optionally track stock. The system automatically updates the status based on your stock levels:
    - **Available:** Stock is above the 'Low Stock Threshold'.
    - **Low:** Stock has reached or fallen below the threshold.
    - **Not Available:** Stock is zero or less.
    - **Available Soon:** A manual status you can set to indicate a restock is planned.
- Clicking the 'Edit' icon opens a modal where you can change all details of a product.
$$, $$
### Çfarë mund të bëni këtu
Kjo është faqja e inventarit ku menaxhoni të gjitha produktet dhe shërbimet tuaja. Ju mund të:
- **Shikoni, kërkoni dhe renditni** të gjithë katalogun tuaj.
- **Shtoni** artikuj të rinj duke përdorur butonin 'Produkt i Ri'.
- **Redaktoni, kopjoni ose fshini** artikujt ekzistues duke përdorur ikonat në çdo rresht.

### Si funksionon
- **Produkte vs. Shërbime:** Mund ta përcaktoni një artikull si 'Mall' (një produkt fizik) ose 'Shërbim'.
- **Ndjekja e Stokut:** Për 'Mallrat', mund të ndiqni stokun në mënyrë opsionale. Sistemi përditëson automatikisht statusin bazuar në nivelet tuaja të stokut:
    - **I disponueshëm:** Stoku është mbi 'Pragun e Stokut të Ulët'.
    - **I ulët:** Stoku ka arritur ose ka rënë nën pragun.
    - **I padisponueshëm:** Stoku është zero ose më pak.
    - **Së shpejti i disponueshëm:** Një status manual që mund ta vendosni për të treguar se një rimbushje është planifikuar.
- Klikimi i ikonës 'Redakto' hap një dritare ku mund të ndryshoni të gjitha detajet e një produkti.
$$),
('invoices_list', $$
### What you can do here
This page lists all your invoices. You can:
- **Search** for a specific invoice by its number or the customer's name.
- **Filter** the list by status (e.g., show only 'overdue' invoices).
- **Edit/View** an invoice by clicking its number or the pencil icon.
- **Perform actions** on each invoice, such as:
    - **Copy:** Creates a new draft invoice with the same details.
    - **Send Email:** Opens your email client with a pre-filled template (requires configuration).
    - **Download PDF:** Generates a professional PDF of the invoice.
    - **Delete:** Only available for invoices in 'draft' status.
$$, $$
### Çfarë mund të bëni këtu
Kjo faqe liston të gjitha faturat tuaja. Ju mund të:
- **Kërkoni** për një faturë specifike sipas numrit të saj ose emrit të klientit.
- **Filtroni** listën sipas statusit (p.sh., shfaq vetëm faturat 'e vonuara').
- **Redaktoni/Shikoni** një faturë duke klikuar numrin e saj ose ikonën e lapsit.
- **Kryeni veprime** në çdo faturë, si:
    - **Kopjo:** Krijon një faturë të re draft me të njëjtat detaje.
    - **Dërgo Email:** Hap klientin tuaj të emailit me një model të paracaktuar (kërkon konfigurim).
    - **Shkarko PDF:** Gjeneron një PDF profesional të faturës.
    - **Fshij:** E disponueshme vetëm për faturat në statusin 'draft'.
$$),
('invoice_editor', $$
### What you can do here
You are creating or editing an invoice. This is where you build the document your customer will receive.

### How it works
1.  **Select a Customer:** Choose an existing customer from the dropdown or create a new one. This is required to save.
2.  **Set Dates:** The 'Issue Date' is today by default, and the 'Due Date' is 14 days from today. You can change these.
3.  **Add Items:**
    - **Add Product:** Opens a list of your saved inventory items to add quickly.
    - **Add Expense:** Allows you to bill a customer for an expense you've already tracked.
    - **Add Item:** Adds a blank line for custom services or one-off items.
4.  **Notes:** Use 'Customer Notes' for information visible on the PDF (like payment terms). 'Internal Notes' are for your team only.
5.  **Save:** Save your progress. The invoice will be in 'draft' status.
6.  **Send/Finalize:** Once saved, you can 'Send via Email', 'Download PDF', or get a 'Payment Link' (if Stripe is enabled). Changing the status from 'draft' to 'sent' will reserve stock for any products on the invoice.

**Good to know:**
- Invoices that have been marked as 'paid' cannot be edited.
$$, $$
### Çfarë mund të bëni këtu
Ju po krijoni ose redaktoni një faturë. Këtu ndërtoni dokumentin që do të marrë klienti juaj.

### Si funksionon
1.  **Zgjidhni një Klient:** Zgjidhni një klient ekzistues nga lista ose krijoni një të ri. Kjo është e nevojshme për të ruajtur.
2.  **Vendosni Datat:** 'Data e Lëshimit' është sot si parazgjedhje, dhe 'Data e Pagesës' është 14 ditë nga sot. Mund t'i ndryshoni këto.
3.  **Shtoni Artikuj:**
    - **Shto Produkt:** Hap një listë të artikujve tuaj të ruajtur në inventar për t'i shtuar shpejt.
    - **Shto Shpenzim:** Ju lejon të faturoni një klient për një shpenzim që e keni ndjekur tashmë.
    - **Shto Artikull:** Shton një rresht bosh për shërbime të personalizuara ose artikuj të njëhershëm.
4.  **Shënime:** Përdorni 'Shënime për Klientin' për informacion të dukshëm në PDF (si kushtet e pagesës). 'Shënimet e Brendshme' janë vetëm për ekipin tuaj.
5.  **Ruaj:** Ruani progresin tuaj. Fatura do të jetë në statusin 'draft'.
6.  **Dërgo/Finalizo:** Pasi të ruhet, mund të 'Dërgoni me Email', 'Shkarkoni PDF', ose të merrni një 'Link Pagese' (nëse Stripe është aktivizuar). Ndryshimi i statusit nga 'draft' në 'dërguar' do të rezervojë stokun për çdo produkt në faturë.

**Mirë të dini:**
- Faturat që janë shënuar si 'paguar' nuk mund të redaktohen.
$$),
('customers_list', $$
### What you can do here
This is your customer database. From this screen, you can:
- **View** all your customers in a sortable list.
- **Search** for a customer by name or customer number.
- **Add** a new customer using the 'New Customer' button.
- **Edit** or **Delete** a customer using the icons in the 'Actions' column.

### How it works
- Clicking on a customer's name will take you to their **Customer Detail Page**. This page shows a complete history of all interactions, documents, and notes related to that customer.
$$, $$
### Çfarë mund të bëni këtu
Kjo është baza juaj e të dhënave të klientëve. Nga ky ekran, ju mund të:
- **Shikoni** të gjithë klientët tuaj në një listë të renditshme.
- **Kërkoni** për një klient sipas emrit ose numrit të klientit.
- **Shtoni** një klient të ri duke përdorur butonin 'Klient i Ri'.
- **Redaktoni** ose **Fshini** një klient duke përdorur ikonat në kolonën 'Veprimet'.

### Si funksionon
- Klikimi mbi emrin e një klienti do t'ju çojë në **Faqen e Detajeve të Klientit**. Kjo faqe tregon një histori të plotë të të gjitha ndërveprimeve, dokumenteve dhe shënimeve që lidhen me atë klient.
$$),
('customer_detail', $$
### What you can do here
This page gives you a complete 360-degree view of a single customer.
- **View Contact Info:** The top panel shows the customer's primary contact details. You can edit them by clicking the pencil icon.
- **See All Activity:** The main timeline shows every interaction you've had with this customer, including invoices, quotes, visits, appointments, and emails, all in chronological order.
- **Manage Notes & Documents:** The panels on the right allow you to keep internal notes and upload important files related to this customer (e.g., contracts, photos).
- **Create New Items:** The '+' button lets you quickly create a new invoice, quote, visit, or appointment that is automatically linked to this customer.
$$, $$
### Çfarë mund të bëni këtu
Kjo faqe ju jep një pamje të plotë 360-gradëshe të një klienti të vetëm.
- **Shikoni Informacionin e Kontaktit:** Paneli i sipërm tregon detajet kryesore të kontaktit të klientit. Mund t'i redaktoni duke klikuar ikonën e lapsit.
- **Shikoni Të Gjithë Aktivitetin:** Linja kohore kryesore tregon çdo ndërveprim që keni pasur me këtë klient, përfshirë faturat, ofertat, vizitat, takimet dhe emailet, të gjitha në rend kronologjik.
- **Menaxhoni Shënimet & Dokumentet:** Panelet në të djathtë ju lejojnë të mbani shënime të brendshme dhe të ngarkoni skedarë të rëndësishëm që lidhen me këtë klient (p.sh., kontrata, foto).
- **Krijoni Artikuj të Rinj:** Butoni '+' ju lejon të krijoni shpejt një faturë, ofertë, vizitë ose takim të ri që lidhet automatikisht me këtë klient.
$$),
('quotes_list', $$
### What you can do here
This page is for managing your quotes and proposals. It's very similar to the invoices list.
- **Search and Filter:** Find quotes by number, customer name, or status.
- **Perform Actions:**
    - **Edit/View:** Open the quote editor.
    - **Convert to Invoice:** This is a key action. It creates a new draft invoice using all the details from the quote and automatically marks the quote as 'accepted'.
    - **Copy, Download, Delete:** These actions work just like they do for invoices.

### How it works
- **Statuses:**
    - **Draft:** Still being worked on.
    - **Sent:** The quote has been sent to the customer.
    - **Accepted:** The customer has approved the quote. This can be set manually or happens automatically when you convert it to an invoice.
    - **Declined:** The customer has rejected the quote.
    - **Expired:** The 'Valid Until' date has passed.
$$, $$
### Çfarë mund të bëni këtu
Kjo faqe është për menaxhimin e ofertave dhe propozimeve tuaja. Është shumë e ngjashme me listën e faturave.
- **Kërko dhe Filtro:** Gjeni oferta sipas numrit, emrit të klientit ose statusit.
- **Kryej Veprime:**
    - **Redakto/Shiko:** Hap redaktorin e ofertës.
    - **Shndërro në Faturë:** Ky është një veprim kyç. Ai krijon një faturë të re draft duke përdorur të gjitha detajet nga oferta dhe automatikisht e shënon ofertën si 'pranuar'.
    - **Kopjo, Shkarko, Fshij:** Këto veprime funksionojnë njësoj si për faturat.

### Si funksionon
- **Statuset:**
    - **Draft:** Ende në punim.
    - **Dërguar:** Oferta i është dërguar klientit.
    - **Pranuar:** Klienti e ka miratuar ofertën. Kjo mund të vendoset manualisht ose ndodh automatikisht kur e shndërroni në faturë.
    - **Refuzuar:** Klienti e ka refuzuar ofertën.
    - **Skaduar:** Data 'E vlefshme deri më' ka kaluar.
$$),
('quote_editor', $$
### What you can do here
You are creating or editing a quote. This screen is almost identical to the invoice editor.

### How it works
1.  **Select a Customer** and add items just like you would for an invoice.
2.  **Set Dates:** The key difference is the **'Valid Until'** date, which determines when the offer expires.
3.  **Save and Send:** Save the quote as a draft, then you can download it as a PDF or send it via email.
4.  **Convert to Invoice:** Once the customer agrees, use the 'Convert to Invoice' button. This is the main action that moves the process forward. It will create a new invoice and link it back to this quote.
$$, $$
### Çfarë mund të bëni këtu
Ju po krijoni ose redaktoni një ofertë. Ky ekran është pothuajse identik me redaktorin e faturave.

### Si funksionon
1.  **Zgjidhni një Klient** dhe shtoni artikuj ashtu siç do të bënit për një faturë.
2.  **Vendosni Datat:** Dallimi kryesor është data **'E vlefshme deri më'**, e cila përcakton se kur skadon oferta.
3.  **Ruaj dhe Dërgo:** Ruani ofertën si draft, pastaj mund ta shkarkoni si PDF ose ta dërgoni me email.
4.  **Shndërro në Faturë:** Pasi klienti të bjerë dakord, përdorni butonin 'Shndërro në Faturë'. Ky është veprimi kryesor që çon procesin përpara. Ai do të krijojë një faturë të re dhe do ta lidhë atë me këtë ofertë.
$$),
('expenses_list', $$
### What you can do here
This page helps you track all your business expenses.
- **View and Search:** See a list of all recorded expenses.
- **Add New Expense:** Use the 'Add Expense' button to open a form where you can enter the date, description, amount, and category of the expense.
- **Manage:** You can Edit, Copy, or Delete existing expense records.

### How it works
- Expenses you track here can be added directly to invoices if you need to bill a customer for them. When you are editing an invoice, use the 'Add Expense' button to select from this list.
$$, $$
### Çfarë mund të bëni këtu
Kjo faqe ju ndihmon të ndiqni të gjitha shpenzimet e biznesit tuaj.
- **Shikoni dhe Kërkoni:** Shihni një listë të të gjitha shpenzimeve të regjistruara.
- **Shto Shpenzim të Ri:** Përdorni butonin 'Shto Shpenzim' për të hapur një formular ku mund të futni datën, përshkrimin, shumën dhe kategorinë e shpenzimit.
- **Menaxhoni:** Mund të Redaktoni, Kopjoni ose Fshini regjistrimet ekzistuese të shpenzimeve.

### Si funksionon
- Shpenzimet që ndiqni këtu mund të shtohen direkt në fatura nëse keni nevojë t'ia faturoni një klienti. Kur jeni duke redaktuar një faturë, përdorni butonin 'Shto Shpenzim' për të zgjedhur nga kjo listë.
$$),
('tasks_list', $$
### What you can do here
This is a simple to-do list for you and your team.
- **Create Tasks:** Use the 'Add Task' button to create new to-dos. You can assign them to a team member, link them to a customer, and set start/end dates.
- **Track Progress:** Mark a task as complete by clicking the checkbox next to it.
- **Filter:** Use the 'Show completed tasks' toggle to hide or show finished items.
- **Manage:** Edit, copy, or delete tasks as needed.
$$, $$
### Çfarë mund të bëni këtu
Kjo është një listë e thjeshtë detyrash për ju dhe ekipin tuaj.
- **Krijoni Detyra:** Përdorni butonin 'Shto Detyrë' për të krijuar detyra të reja. Mund t'i caktoni ato një anëtari të ekipit, t'i lidhni me një klient dhe të vendosni data fillimi/mbarimi.
- **Ndiqni Progresin:** Shënoni një detyfrë si të përfunduar duke klikuar kutinë e kontrollit pranë saj.
- **Filtro:** P