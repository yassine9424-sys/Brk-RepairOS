
-- BRK RepairOS - Supabase schema
-- À coller dans Supabase > SQL Editor > New query > Run

create extension if not exists "pgcrypto";

-- Profils utilisateurs
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','equipe')) default 'equipe',
  created_at timestamptz default now()
);

-- Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now()
);

-- Appareils reçus
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_tag text unique not null,
  client_id uuid references public.clients(id) on delete set null,
  model text not null,
  imei text,
  serial_number text,
  color text,
  pin_code text,
  battery_level integer,
  condition_received text,
  created_at timestamptz default now()
);

-- Stock pièces
create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  product text,
  model text not null,
  category text not null,
  quality text,
  location text,
  supplier text,
  stock integer not null default 0,
  min_stock integer not null default 0,
  purchase_price_ht numeric(10,2),
  purchase_price_ttc numeric(10,2),
  alert_hidden boolean default false,
  created_at timestamptz default now()
);

-- Réparations
create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  ticket_ref text unique not null,
  client_id uuid references public.clients(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  issue text,
  status text not null default 'Reçu',
  priority text not null default 'Normale',
  technician text,
  price_ttc numeric(10,2),
  part_cost_ttc numeric(10,2),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tarifs réparation
create table if not exists public.repair_prices (
  id uuid primary key default gen_random_uuid(),
  brand text default 'Apple',
  model text not null,
  screen_compatible numeric(10,2),
  screen_premium numeric(10,2),
  screen_original numeric(10,2),
  battery_compatible numeric(10,2),
  battery_premium numeric(10,2),
  created_at timestamptz default now(),
  unique(brand, model)
);

-- Mouvements de stock
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references public.parts(id) on delete set null,
  repair_id uuid references public.repairs(id) on delete set null,
  movement_type text not null check (movement_type in ('entrée','sortie','ajustement','retour_sav','défectueux')),
  quantity integer not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Documents / photos / factures
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid references public.repairs(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  part_id uuid references public.parts(id) on delete cascade,
  document_type text not null,
  file_url text,
  file_name text,
  created_at timestamptz default now()
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  level text not null default 'info',
  is_read boolean default false,
  repair_id uuid references public.repairs(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  created_at timestamptz default now()
);

-- Fonction : vérifier admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

-- Fonction : création automatique profil
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Utilisateur'),
    coalesce(new.raw_user_meta_data->>'role', 'equipe')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.devices enable row level security;
alter table public.parts enable row level security;
alter table public.repairs enable row level security;
alter table public.repair_prices enable row level security;
alter table public.stock_movements enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;

-- Policies lecture équipe/admin
create policy "profiles_read_own_or_admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin());

create policy "clients_read_auth" on public.clients for select using (auth.role() = 'authenticated');
create policy "clients_insert_auth" on public.clients for insert with check (auth.role() = 'authenticated');
create policy "clients_update_auth" on public.clients for update using (auth.role() = 'authenticated');
create policy "clients_delete_admin" on public.clients for delete using (public.is_admin());

create policy "devices_read_auth" on public.devices for select using (auth.role() = 'authenticated');
create policy "devices_insert_auth" on public.devices for insert with check (auth.role() = 'authenticated');
create policy "devices_update_auth" on public.devices for update using (auth.role() = 'authenticated');
create policy "devices_delete_admin" on public.devices for delete using (public.is_admin());

create policy "parts_read_auth" on public.parts for select using (auth.role() = 'authenticated');
create policy "parts_insert_admin" on public.parts for insert with check (public.is_admin());
create policy "parts_update_admin" on public.parts for update using (public.is_admin());
create policy "parts_delete_admin" on public.parts for delete using (public.is_admin());

create policy "repairs_read_auth" on public.repairs for select using (auth.role() = 'authenticated');
create policy "repairs_insert_auth" on public.repairs for insert with check (auth.role() = 'authenticated');
create policy "repairs_update_auth" on public.repairs for update using (auth.role() = 'authenticated');
create policy "repairs_delete_admin" on public.repairs for delete using (public.is_admin());

create policy "repair_prices_read_auth" on public.repair_prices for select using (auth.role() = 'authenticated');
create policy "repair_prices_insert_admin" on public.repair_prices for insert with check (public.is_admin());
create policy "repair_prices_update_admin" on public.repair_prices for update using (public.is_admin());
create policy "repair_prices_delete_admin" on public.repair_prices for delete using (public.is_admin());

create policy "stock_movements_read_auth" on public.stock_movements for select using (auth.role() = 'authenticated');
create policy "stock_movements_insert_auth" on public.stock_movements for insert with check (auth.role() = 'authenticated');
create policy "stock_movements_delete_admin" on public.stock_movements for delete using (public.is_admin());

create policy "documents_read_auth" on public.documents for select using (auth.role() = 'authenticated');
create policy "documents_insert_auth" on public.documents for insert with check (auth.role() = 'authenticated');
create policy "documents_delete_admin" on public.documents for delete using (public.is_admin());

create policy "notifications_read_auth" on public.notifications for select using (auth.role() = 'authenticated');
create policy "notifications_update_auth" on public.notifications for update using (auth.role() = 'authenticated');
create policy "notifications_insert_auth" on public.notifications for insert with check (auth.role() = 'authenticated');
create policy "notifications_delete_admin" on public.notifications for delete using (public.is_admin());

-- Storage buckets à créer dans Supabase Storage :
-- 1) repair-photos
-- 2) supplier-invoices
-- 3) repair-documents
