import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import './styles.css'

const statuses = ['Reçu','Diagnostic','En attente client','En attente pièce','Prêt à réparer','En réparation','Réparé','Livré','Annulé']
const money = v => (v === null || v === undefined || v === '') ? '-' : `${Number(v).toFixed(2).replace('.', ',')} €`

function App(){
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null)
  const [email,setEmail]=useState(''),[password,setPassword]=useState('')
  const [tab,setTab]=useState('dashboard'),[parts,setParts]=useState([]),[repairs,setRepairs]=useState([]),[prices,setPrices]=useState([]),[clients,setClients]=useState([])
  const [query,setQuery]=useState(''),[loading,setLoading]=useState(false),[message,setMessage]=useState('')
  const isAdmin = profile?.role === 'admin'

  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user) loadAll()},[session])

  async function login(e){e.preventDefault();setLoading(true);setMessage('');const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)setMessage(error.message); setLoading(false)}
  async function logout(){await supabase.auth.signOut();setSession(null);setProfile(null)}

  async function loadAll(){
    setLoading(true)
    const user=(await supabase.auth.getUser()).data.user
    const [pr,pa,re,ri,cl]=await Promise.all([
      supabase.from('profiles').select('*').eq('id',user?.id).maybeSingle(),
      supabase.from('parts').select('*').order('created_at',{ascending:false}),
      supabase.from('repairs').select('*, clients(full_name, phone), devices(device_tag, model, imei)').order('created_at',{ascending:false}),
      supabase.from('repair_prices').select('*').order('model'),
      supabase.from('clients').select('*').order('created_at',{ascending:false})
    ])
    setProfile(pr.data); setParts(pa.data||[]); setRepairs(re.data||[]); setPrices(ri.data||[]); setClients(cl.data||[]); setLoading(false)
  }

  async function createPart(e){
    e.preventDefault(); if(!isAdmin)return alert('Action réservée admin.')
    const f=new FormData(e.currentTarget), category=f.get('category'), model=f.get('model'), location=f.get('location')
    const ref=f.get('ref') || `${category?.slice(0,3)}-${model?.replaceAll(' ','').slice(0,7)}-${location?.replaceAll(' ','').slice(0,3)}`.toUpperCase()
    const {error}=await supabase.from('parts').insert({ref,product:f.get('product'),model,category,quality:f.get('quality'),location,supplier:f.get('supplier'),stock:Number(f.get('stock')||0),min_stock:Number(f.get('min_stock')||0),purchase_price_ht:Number(f.get('purchase_price_ht')||0),purchase_price_ttc:Number(f.get('purchase_price_ttc')||0),alert_hidden:false})
    if(error)return alert(error.message); e.currentTarget.reset(); loadAll()
  }

  async function updatePartStock(part,newStock,note='Ajustement manuel'){
    if(!isAdmin)return alert('Action réservée admin.')
    const safe=Math.max(0,Number(newStock||0)), diff=safe-Number(part.stock||0)
    const {error}=await supabase.from('parts').update({stock:safe,alert_hidden:false}).eq('id',part.id)
    if(error)return alert(error.message)
    if(diff!==0) await supabase.from('stock_movements').insert({part_id:part.id,movement_type:diff>0?'entrée':'sortie',quantity:Math.abs(diff),note})
    loadAll()
  }
  async function setPartStock(part){const v=prompt(`Nouveau stock pour ${part.ref}`,part.stock); if(v!==null) updatePartStock(part,v,`Stock défini à ${v}`)}
  async function deletePart(part){if(!isAdmin)return alert('Action réservée admin.'); if(!confirm(`Supprimer ${part.ref} ?`))return; const {error}=await supabase.from('parts').delete().eq('id',part.id); if(error)return alert(error.message); loadAll()}
  async function toggleAlert(part){if(!isAdmin)return alert('Action réservée admin.'); const {error}=await supabase.from('parts').update({alert_hidden:!part.alert_hidden}).eq('id',part.id); if(error)return alert(error.message); loadAll()}

  async function createRepair(e){
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const ticket=`BRK-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, deviceTag=`DEV-BRK-${String(Date.now()).slice(-5)}`
    const cr=await supabase.from('clients').insert({full_name:f.get('client'),phone:f.get('phone')}).select().single(); if(cr.error)return alert(cr.error.message)
    const dr=await supabase.from('devices').insert({device_tag:deviceTag,client_id:cr.data.id,model:f.get('device'),imei:f.get('imei'),color:f.get('color'),condition_received:f.get('condition_received'),battery_level:Number(f.get('battery_level')||0)}).select().single(); if(dr.error)return alert(dr.error.message)
    const partId=f.get('part_id')||null; let partCost=0
    if(partId){const p=parts.find(x=>x.id===partId); partCost=Number(p?.purchase_price_ttc||0); await updatePartStock(p,Number(p.stock||0)-1,`Sortie automatique pour ${ticket}`)}
    const rr=await supabase.from('repairs').insert({ticket_ref:ticket,client_id:cr.data.id,device_id:dr.data.id,part_id:partId,issue:f.get('issue'),status:f.get('status'),priority:f.get('priority'),technician:f.get('technician'),price_ttc:Number(f.get('price_ttc')||0),part_cost_ttc:partCost,notes:f.get('notes')}).select().single()
    if(rr.error)return alert(rr.error.message); e.currentTarget.reset(); loadAll()
  }

  async function updateRepairStatus(r,status){const {error}=await supabase.from('repairs').update({status,updated_at:new Date().toISOString()}).eq('id',r.id); if(error)return alert(error.message); loadAll()}
  async function deleteRepair(r){if(!isAdmin)return alert('Action réservée admin.'); if(!confirm(`Supprimer ${r.ticket_ref} ?`))return; const {error}=await supabase.from('repairs').delete().eq('id',r.id); if(error)return alert(error.message); loadAll()}
  async function updateRepairPrice(r){if(!isAdmin)return alert('Action réservée admin.'); const v=prompt(`Nouveau prix TTC pour ${r.ticket_ref}`,r.price_ttc||0); if(v===null)return; const {error}=await supabase.from('repairs').update({price_ttc:Number(v||0)}).eq('id',r.id); if(error)return alert(error.message); loadAll()}
  async function updatePriceRow(p,field){if(!isAdmin)return alert('Action réservée admin.'); const v=prompt(`Nouvelle valeur pour ${p.model}`,p[field]??''); if(v===null)return; const {error}=await supabase.from('repair_prices').update({[field]:v===''?null:Number(v)}).eq('id',p.id); if(error)return alert(error.message); loadAll()}

  const alerts=parts.filter(p=>Number(p.stock)<=Number(p.min_stock||0)&&!p.alert_hidden)
  const activeRepairs=repairs.filter(r=>!['Livré','Annulé'].includes(r.status))
  const turnover=repairs.reduce((s,r)=>s+Number(r.price_ttc||0),0), margin=repairs.reduce((s,r)=>s+Number(r.price_ttc||0)-Number(r.part_cost_ttc||0),0)
  const filteredParts=parts.filter(p=>JSON.stringify(p).toLowerCase().includes(query.toLowerCase()))
  const filteredRepairs=repairs.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))
  const filteredPrices=prices.filter(p=>JSON.stringify(p).toLowerCase().includes(query.toLowerCase()))

  if(!session) return <main className="login-page"><form className="login-card" onSubmit={login}><div className="brand"><h1>BRK RepairOS</h1><p>Réparez. Suivez. Contrôlez.</p></div><input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="Mot de passe" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={loading}>{loading?'Connexion...':'Connexion'}</button>{message&&<p className="error">{message}</p>}</form></main>

  return <div className="app"><aside className="sidebar"><div className="brand"><h1>BRK RepairOS</h1><p>Réparez. Suivez. Contrôlez.</p></div><nav>
    <button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}>📊 Dashboard</button>
    <button className={tab==='repairs'?'active':''} onClick={()=>setTab('repairs')}>🛠️ Réparations</button>
    <button className={tab==='parts'?'active':''} onClick={()=>setTab('parts')}>📦 Stock pièces</button>
    <button className={tab==='prices'?'active':''} onClick={()=>setTab('prices')}>💶 Tarifs réparation</button>
    <button className={tab==='clients'?'active':''} onClick={()=>setTab('clients')}>👤 Clients</button>
    <button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>🔐 Admin</button>
  </nav><div className="role-box"><strong>{isAdmin?'Abdel / Mohamed':'Équipe'}</strong><span>{session.user.email}</span><button onClick={logout}>Déconnexion</button></div></aside>
  <main className="main"><header><div><h2>{tab}</h2><p>Application cloud connectée à Supabase.</p></div><input className="search" placeholder="Recherche globale..." value={query} onChange={e=>setQuery(e.target.value)}/></header>
  {alerts.length>0&&<div className="alert">⚠️ Stock critique : {alerts.map(a=>`${a.ref} (${a.location})`).join(' • ')}</div>}

  {tab==='dashboard'&&<><section className="kpis"><div><small>Réparations actives</small><strong>{activeRepairs.length}</strong></div><div><small>Pièces stock</small><strong>{parts.length}</strong></div><div><small>Alertes stock</small><strong>{alerts.length}</strong></div><div><small>CA estimé</small><strong>{money(turnover)}</strong></div><div><small>Marge</small><strong>{isAdmin?money(margin):'Masqué'}</strong></div></section><section className="grid"><div className="card"><h3>Dernières réparations</h3>{repairs.slice(0,6).map(r=><div className="line" key={r.id}>{r.ticket_ref} — {r.devices?.model} — {r.status}</div>)}</div><div className="card"><h3>Stock critique</h3>{alerts.length?alerts.map(p=><div className="line" key={p.id}>{p.ref} — stock {p.stock}</div>):<p>Aucune alerte.</p>}</div></section></>}

  {tab==='repairs'&&<section><div className="card"><h3>Créer une réparation</h3><form className="form" onSubmit={createRepair}><input name="client" placeholder="Client" required/><input name="phone" placeholder="Téléphone"/><input name="device" placeholder="Appareil / modèle" required/><input name="imei" placeholder="IMEI / Série"/><input name="color" placeholder="Couleur"/><input name="battery_level" type="number" placeholder="Batterie %"/><select name="condition_received"><option>Bon état</option><option>Écran cassé</option><option>Ne s’allume pas</option><option>Oxydation suspectée</option></select><input name="issue" placeholder="Panne"/><select name="part_id"><option value="">Aucune pièce</option>{parts.map(p=><option key={p.id} value={p.id}>{p.ref} — stock {p.stock}</option>)}</select><input name="technician" placeholder="Technicien"/><select name="priority"><option>Normale</option><option>Haute</option><option>Urgente</option></select><select name="status">{statuses.map(s=><option key={s}>{s}</option>)}</select><input name="price_ttc" type="number" placeholder="Prix client TTC"/><textarea name="notes" placeholder="Notes internes"/><button>Créer réparation</button></form></div><div className="card"><h3>Liste réparations</h3><table><thead><tr><th>Ticket</th><th>Client</th><th>Appareil</th><th>Statut</th><th>Prix</th><th>Actions</th></tr></thead><tbody>{filteredRepairs.map(r=><tr key={r.id}><td>{r.ticket_ref}</td><td>{r.clients?.full_name}</td><td>{r.devices?.model}</td><td><select value={r.status} onChange={e=>updateRepairStatus(r,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></td><td>{money(r.price_ttc)}</td><td className="actions-cell">{isAdmin&&<button onClick={()=>updateRepairPrice(r)}>Prix</button>}{isAdmin&&<button className="danger" onClick={()=>deleteRepair(r)}>Supprimer</button>}</td></tr>)}</tbody></table></div></section>}

  {tab==='parts'&&<section>{isAdmin&&<div className="card"><h3>Ajouter une pièce</h3><form className="form" onSubmit={createPart}><input name="ref" placeholder="Référence interne auto ou manuelle"/><input name="product" placeholder="Produit ex: iPhone"/><input name="model" placeholder="Modèle" required/><select name="category"><option>Batterie</option><option>Écran</option><option>HP</option><option>Micro</option><option>Caméra</option><option>Connecteur charge</option><option>Autre</option></select><input name="quality" placeholder="Qualité"/><input name="location" placeholder="Emplacement"/><input name="supplier" placeholder="Fournisseur"/><input name="stock" type="number" placeholder="Stock"/><input name="min_stock" type="number" placeholder="Seuil alerte"/><input name="purchase_price_ht" type="number" placeholder="Prix HT"/><input name="purchase_price_ttc" type="number" placeholder="Prix TTC"/><button>Ajouter pièce</button></form></div>}<div className="card"><h3>Stock pièces</h3><table><thead><tr><th>Réf</th><th>Modèle</th><th>Catégorie</th><th>Emplacement</th><th>Stock</th><th>Prix achat</th><th>Actions admin</th></tr></thead><tbody>{filteredParts.map(p=><tr key={p.id}><td>{p.ref}</td><td>{p.model}</td><td>{p.category}</td><td>{p.location}</td><td><strong className={Number(p.stock)<=Number(p.min_stock)?'bad':'good'}>{p.stock}</strong></td><td>{isAdmin?money(p.purchase_price_ttc):'Masqué'}</td><td className="actions-cell">{isAdmin?<><button onClick={()=>updatePartStock(p,Number(p.stock)+1,'+1 stock manuel')}>+1</button><button onClick={()=>updatePartStock(p,Number(p.stock)-1,'-1 stock manuel')}>-1</button><button onClick={()=>setPartStock(p)}>Modifier</button><button onClick={()=>toggleAlert(p)}>{p.alert_hidden?'Réactiver alerte':'Masquer alerte'}</button><button className="danger" onClick={()=>deletePart(p)}>Supprimer</button></>:'Lecture seule'}</td></tr>)}</tbody></table></div></section>}

  {tab==='prices'&&<div className="card"><h3>Tarifs réparation iPhone</h3><table><thead><tr><th>Modèle</th><th>Écran compatible</th><th>Écran premium</th><th>Écran original</th><th>Batterie compatible</th><th>Batterie premium</th></tr></thead><tbody>{filteredPrices.map(p=><tr key={p.id}><td>{p.model}</td><td onDoubleClick={()=>updatePriceRow(p,'screen_compatible')}>{money(p.screen_compatible)}</td><td onDoubleClick={()=>updatePriceRow(p,'screen_premium')}>{money(p.screen_premium)}</td><td onDoubleClick={()=>updatePriceRow(p,'screen_original')}>{money(p.screen_original)}</td><td onDoubleClick={()=>updatePriceRow(p,'battery_compatible')}>{money(p.battery_compatible)}</td><td onDoubleClick={()=>updatePriceRow(p,'battery_premium')}>{money(p.battery_premium)}</td></tr>)}</tbody></table>{isAdmin&&<p className="hint">Astuce admin : double-clique sur un prix pour le modifier.</p>}</div>}

  {tab==='clients'&&<div className="card"><h3>Clients</h3><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th></tr></thead><tbody>{clients.map(c=><tr key={c.id}><td>{c.full_name}</td><td>{c.phone}</td><td>{c.email}</td></tr>)}</tbody></table></div>}
  {tab==='admin'&&<div className="card"><h3>Admin</h3><p>Rôle actuel : <strong>{profile?.role}</strong></p><p>{isAdmin?'Tu as accès aux boutons de modification, suppression, prix achat et stock.':'Compte équipe : accès limité.'}</p><button onClick={loadAll}>Rafraîchir les données</button></div>}
  </main></div>
}
createRoot(document.getElementById('root')).render(<App />)
