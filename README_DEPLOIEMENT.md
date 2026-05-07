# BRK RepairOS — App Cloud Vercel + Supabase

## 1. Supabase
1. Crée un projet Supabase.
2. Dans SQL Editor, colle et exécute le fichier `01_schema.sql` du pack Supabase déjà fourni.
3. Exécute ensuite `02_seed_iphone_tarifs.sql`.
4. Dans Storage, crée les buckets :
   - repair-photos
   - supplier-invoices
   - repair-documents

## 2. Variables
Dans Supabase > Project Settings > API :
- copie Project URL
- copie anon public key

Crée un fichier `.env` à la racine avec :
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 3. Tester en local
```bash
npm install
npm run dev
```

## 4. Déployer sur Vercel
1. Mets ce dossier sur GitHub.
2. Va sur Vercel > Add New Project.
3. Importe le repo.
4. Ajoute les variables :
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
5. Clique Deploy.

## 5. Comptes
Dans Supabase Authentication > Users :
- crée les comptes Abdel / Mohamed
- crée les comptes équipe

Puis dans SQL Editor :
```sql
update public.profiles set role = 'admin'
where full_name ilike '%Abdel%' or full_name ilike '%Mohamed%';
```

## Important
Cette version est la première vraie base cloud.
Elle connecte :
- login
- stock
- réparations
- clients
- tarifs iPhone
- sortie automatique de stock à la création d'une réparation
