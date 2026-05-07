
# BRK RepairOS — Préparation Supabase

## Ce que ce pack prépare
- Utilisateurs : Admin / Équipe
- Clients
- Appareils reçus
- Réparations
- Stock pièces
- Tarifs réparation iPhone
- Mouvements de stock
- Documents / photos / factures
- Notifications
- Sécurité RLS Supabase

## Étape 1 — Créer le projet Supabase
1. Va sur Supabase
2. Crée un projet : `brk-repairos`
3. Va dans SQL Editor
4. Colle le contenu de `01_schema.sql`
5. Clique Run
6. Colle ensuite `02_seed_iphone_tarifs.sql`
7. Clique Run

## Étape 2 — Créer les buckets Storage
Dans Supabase > Storage, crée :
- `repair-photos`
- `supplier-invoices`
- `repair-documents`

## Étape 3 — Créer les utilisateurs
Dans Supabase > Authentication > Users :
- créer Abdel / Mohamed en admin
- créer les comptes équipe en role `equipe`

Pour mettre Abdel/Mohamed en admin :
```sql
update public.profiles
set role = 'admin'
where full_name ilike '%Abdel%'
   or full_name ilike '%Mohamed%';
```

## Étape 4 — Brancher le site
Il faudra ensuite transformer le HTML local en vraie app connectée avec :
- `@supabase/supabase-js`
- URL du projet Supabase
- clé publishable/anon
- login email/mot de passe
- fonctions CRUD connectées aux tables

## Variables à garder
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Sur Vercel, elles seront à mettre dans Project Settings > Environment Variables.
