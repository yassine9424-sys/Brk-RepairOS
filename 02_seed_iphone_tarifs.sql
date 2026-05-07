
-- BRK RepairOS - données initiales tarifs iPhone
insert into public.repair_prices
(brand, model, screen_compatible, screen_premium, screen_original, battery_compatible, battery_premium)
values
('Apple','iPhone 11',70,null,100,40,null),
('Apple','iPhone 11 Pro',95,125,135,45,null),
('Apple','iPhone 11 Pro Max',95,125,150,50,null),
('Apple','iPhone 12',95,120,150,40,null),
('Apple','iPhone 12 Pro',95,120,150,40,null),
('Apple','iPhone 12 Pro Max',105,145,195,50,null),
('Apple','iPhone 13',95,135,160,40,65),
('Apple','iPhone 13 Pro',145,185,280,40,65),
('Apple','iPhone 13 Pro Max',150,195,335,50,85),
('Apple','iPhone 14',130,165,225,55,90),
('Apple','iPhone 14 Pro',160,220,305,60,95),
('Apple','iPhone 14 Pro Max',165,225,360,60,95),
('Apple','iPhone 15',145,200,260,55,90),
('Apple','iPhone 15 Pro',175,275,310,80,105),
('Apple','iPhone 15 Pro Max',175,285,385,95,110),
('Apple','iPhone 16',175,235,295,95,null),
('Apple','iPhone 16 Pro',195,295,335,120,null),
('Apple','iPhone 16 Pro Max',225,335,450,135,null),
('Apple','iPhone 17',null,265,405,null,null),
('Apple','iPhone 17 Pro',235,335,465,null,null),
('Apple','iPhone 17 Pro Max',265,385,495,null,null)
on conflict (brand, model) do update set
screen_compatible = excluded.screen_compatible,
screen_premium = excluded.screen_premium,
screen_original = excluded.screen_original,
battery_compatible = excluded.battery_compatible,
battery_premium = excluded.battery_premium;

-- Exemples de pièces
insert into public.parts
(ref, product, model, category, quality, location, supplier, stock, min_stock, purchase_price_ht, purchase_price_ttc)
values
('ECR-IP13-OLED-A1','iPhone','iPhone 13','Écran','OLED Premium','Tiroir A1','Fournisseur A',4,1,72,86.40),
('BAT-IP12-PR-B2','iPhone','iPhone 12','Batterie','Premium','Bac B2','Fournisseur B',0,1,18,21.60),
('MIC-SA52-C3','Samsung','A52','Micro','Compatible','Bac C3','Fournisseur C',2,1,8,9.60)
on conflict (ref) do nothing;
