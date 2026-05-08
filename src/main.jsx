import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import './styles.css'

const statuses = ['Reçu','Diagnostic','En attente client','En attente pièce','Prêt à réparer','En réparation','Réparé','Livré','Annulé']

function money(v){
  if(v === null || v === undefined || v === '') return '-'
  return `${Number(v).toFixed(2).replace('.', ',')} €`
}

function title(tab){
  return {
    dashboard:'Dashboard',
    notifications:'Notifications',
    repairs:'Réparations',
    devices:'Appareils reçus',
    tickets:'Tickets atelier',
    clients:'Clients',
    stock:'Stock pièces',
    labels:'Étiquettes',
    movements:'Mouvements',
    orders:'Commandes',
    prices:'Tarifs réparation',
    admin:'Admin'
  }[tab] || tab
}

function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)

  const [tab,setTab]=useState('dashboard')
  const [query,setQuery]=useState('')
  const [parts,setParts]=useState([])
  const [repairs,setRepairs]=useState([])
  const [prices,setPrices]=useState([])
  const [clients,setClients]=useState([])
  const [movements,setMovements]=useState([])

  const [showRepairForm,setShowRepairForm]=useState(false)
  const [showStockForm,setShowStockForm]=useState(false)
  const [stockCategory,setStockCategory]=useState('Batterie')

  const isAdmin = profile?.role === 'admin'

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:listener}=supabase.auth.onAuthStateChange((_event,currentSession)=>setSession(currentSession))
    return()=>listener.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(session?.user) loadAll()
  },[session])

  async function login(e){
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error) setMessage(error.message)
    setLoading(false)
  }

  async function logout(){
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  async function loadAll(){
    setLoading(true)
    const user=(await supabase.auth.getUser()).data.user
    const [profileRes,partsRes,repairsRes,pricesRes,clientsRes,movementsRes]=await Promise.all([
      supabase.from('profiles').select('*').eq('id',user?.id).maybeSingle(),
      supabase.from('parts').select('*').order('created_at',{ascending:false}),
      supabase.from('repairs').select('*, clients(full_name, phone, email), devices(device_tag, model, imei, color, condition_received, battery_level)').order('created_at',{ascending:false}),
      supabase.from('repair_prices').select('*').order('model'),
      supabase.from('clients').select('*').order('created_at',{ascending:false}),
      supabase.from('stock_movements').select('*, parts(ref, model, category)').order('created_at',{ascending:false}).limit(80)
    ])
    setProfile(profileRes.data)
    setParts(partsRes.data||[])
    setRepairs(repairsRes.data||[])
    setPrices(pricesRes.data||[])
    setClients(clientsRes.data||[])
    setMovements(movementsRes.data||[])
    setLoading(false)
  }

  const search = item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  const alerts = parts.filter(p=>Number(p.stock)<=Number(p.min_stock||0) && !p.alert_hidden)
  const activeRepairs = repairs.filter(r=>!['Livré','Annulé'].includes(r.status))
  const urgentRepairs = repairs.filter(r=>r.priority==='Urgente' && !['Livré','Annulé'].includes(r.status))
  const turnover = repairs.reduce((s,r)=>s+Number(r.price_ttc||0),0)
  const margin = repairs.reduce((s,r)=>s+Number(r.price_ttc||0)-Number(r.part_cost_ttc||0),0)
  const screenStock = parts.filter(p=>/écran|ecran/i.test(p.category||'')).reduce((s,p)=>s+Number(p.stock||0),0)
  const batteryStock = parts.filter(p=>/batterie/i.test(p.category||'')).reduce((s,p)=>s+Number(p.stock||0),0)
  const otherStock = parts.reduce((s,p)=>s+Number(p.stock||0),0)-screenStock-batteryStock

  const filteredParts = parts.filter(search)
  const filteredRepairs = repairs.filter(search)
  const filteredPrices = prices.filter(search)
  const filteredClients = clients.filter(search)

  async function createPart(e){
    e.preventDefault()
    if(!isAdmin) return alert('Action réservée admin.')

    const f = new FormData(e.currentTarget)
    const model = f.get('model')
    const selectedCategory = f.get('category')
    const customCategory = f.get('custom_category')
    const category = selectedCategory === 'Autre' ? (customCategory || 'Autre') : selectedCategory
    const location = f.get('location') || ''
    const refLocation = location || 'X'
    const ref = `${category?.slice(0,3)}-${model?.replaceAll(' ','').slice(0,9)}-${refLocation.replaceAll(' ','').slice(0,3)}`.toUpperCase()

    const {error}=await supabase.from('parts').insert({
      ref,
      product:model,
      model,
      category,
      quality:f.get('quality') || '',
      location,
      supplier:f.get('supplier') || '',
      stock:Number(f.get('stock')||0),
      min_stock:Number(f.get('min_stock')||0),
      purchase_price_ht:Number(f.get('purchase_price_ht')||0),
      purchase_price_ttc:Number(f.get('purchase_price_ttc')||0),
      alert_hidden:false
    })
    if(error) return alert(error.message)

    await supabase.from('stock_movements').insert({
      movement_type:'entrée',
      quantity:Number(f.get('stock')||0),
      note:`Entrée stock : ${ref}`
    })

    e.currentTarget.reset()
    setStockCategory('Batterie')
    setShowStockForm(false)
    loadAll()
  }

  async function updatePartStock(part,newStock,note='Ajustement manuel'){
    if(!isAdmin) return alert('Action réservée admin.')
    const safe = Math.max(0,Number(newStock||0))
    const diff = safe - Number(part.stock||0)

    const {error}=await supabase.from('parts').update({stock:safe,alert_hidden:false}).eq('id',part.id)
    if(error) return alert(error.message)

    if(diff!==0){
      await supabase.from('stock_movements').insert({
        part_id:part.id,
        movement_type:diff>0?'entrée':'sortie',
        quantity:Math.abs(diff),
        note
      })
    }
    loadAll()
  }

  async function setPartStock(part){
    const v = prompt(`Nouveau stock pour ${part.ref}`,part.stock)
    if(v!==null) updatePartStock(part,v,`Stock défini manuellement à ${v}`)
  }

  async function deletePart(part){
    if(!isAdmin) return alert('Action réservée admin.')
    if(!confirm(`Supprimer la pièce ${part.ref} ?`)) return
    const {error}=await supabase.from('parts').delete().eq('id',part.id)
    if(error) return alert(error.message)
    loadAll()
  }

  async function toggleAlert(part){
    if(!isAdmin) return alert('Action réservée admin.')
    const {error}=await supabase.from('parts').update({alert_hidden:!part.alert_hidden}).eq('id',part.id)
    if(error) return alert(error.message)
    loadAll()
  }

  async function createRepair(e){
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const ticket = `BRK-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    const deviceTag = `DEV-BRK-${String(Date.now()).slice(-5)}`
    const partId = f.get('part_id') || null

    const clientRes = await supabase.from('clients').insert({
      full_name:f.get('client'),
      phone:f.get('phone'),
      email:f.get('email')
    }).select().single()
    if(clientRes.error) return alert(clientRes.error.message)

    const deviceRes = await supabase.from('devices').insert({
      device_tag:deviceTag,
      client_id:clientRes.data.id,
      model:f.get('device'),
      imei:f.get('imei'),
      color:f.get('color'),
      condition_received:f.get('condition_received'),
      battery_level:Number(f.get('battery_level')||0)
    }).select().single()
    if(deviceRes.error) return alert(deviceRes.error.message)

    let partCost = 0
    if(partId){
      const part = parts.find(p=>p.id===partId)
      partCost = Number(part?.purchase_price_ttc||0)
      await supabase.from('parts').update({stock:Math.max(0,Number(part.stock)-1),alert_hidden:false}).eq('id',partId)
    }

    const repairRes = await supabase.from('repairs').insert({
      ticket_ref:ticket,
      client_id:clientRes.data.id,
      device_id:deviceRes.data.id,
      part_id:partId,
      issue:f.get('issue'),
      status:f.get('status'),
      priority:f.get('priority'),
      technician:f.get('technician'),
      price_ttc:Number(f.get('price_ttc')||0),
      part_cost_ttc:partCost,
      notes:f.get('notes')
    }).select().single()
    if(repairRes.error) return alert(repairRes.error.message)

    if(partId){
      await supabase.from('stock_movements').insert({
        part_id:partId,
        repair_id:repairRes.data.id,
        movement_type:'sortie',
        quantity:1,
        note:`Sortie automatique pour ${ticket}`
      })
    }

    e.currentTarget.reset()
    setShowRepairForm(false)
    loadAll()
  }

  async function updateRepairStatus(repair,status){
    const {error}=await supabase.from('repairs').update({status,updated_at:new Date().toISOString()}).eq('id',repair.id)
    if(error) return alert(error.message)
    loadAll()
  }

  async function deleteRepair(repair){
    if(!isAdmin) return alert('Action réservée admin.')
    if(!confirm(`Supprimer ${repair.ticket_ref} ?`)) return
    const {error}=await supabase.from('repairs').delete().eq('id',repair.id)
    if(error) return alert(error.message)
    loadAll()
  }

  async function updateRepairPrice(repair){
    if(!isAdmin) return alert('Action réservée admin.')
    const v = prompt(`Nouveau prix TTC pour ${repair.ticket_ref}`,repair.price_ttc||0)
    if(v===null) return
    const {error}=await supabase.from('repairs').update({price_ttc:Number(v||0)}).eq('id',repair.id)
    if(error) return alert(error.message)
    loadAll()
  }

  async function updatePriceRow(row,field){
    if(!isAdmin) return alert('Action réservée admin.')
    const v = prompt(`Nouvelle valeur pour ${row.model}`,row[field] ?? '')
    if(v===null) return
    const {error}=await supabase.from('repair_prices').update({[field]:v===''?null:Number(v)}).eq('id',row.id)
    if(error) return alert(error.message)
    loadAll()
  }

  if(!session){
    return <main className="login-page">
      <form className="login-card" onSubmit={login}>
        <div className="brand">
          <h1>BRK RepairOS</h1>
          <p>Réparez. Suivez. Contrôlez.</p>
        </div>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="Mot de passe" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button disabled={loading}>{loading?'Connexion...':'Connexion'}</button>
        {message && <p className="error">{message}</p>}
      </form>
    </main>
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand">
        <h1>BRK RepairOS</h1>
        <p>Réparez. Suivez. Contrôlez.</p>
      </div>

      <div className="menu-scroll">
        <div className="menu-title">Pilotage</div>
        <nav>
          <button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}>📊 Dashboard</button>
          <button className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}>🔔 Notifications <b>{alerts.length}</b></button>
        </nav>

        <div className="menu-title">Atelier</div>
        <nav>
          <button className={tab==='repairs'?'active':''} onClick={()=>setTab('repairs')}>🛠️ Réparations</button>
          <button className={tab==='devices'?'active':''} onClick={()=>setTab('devices')}>📱 Appareils reçus</button>
          <button className={tab==='clients'?'active':''} onClick={()=>setTab('clients')}>👤 Clients</button>
          <button className={tab==='tickets'?'active':''} onClick={()=>setTab('tickets')}>🎫 Tickets atelier</button>
        </nav>

        <div className="menu-title">Stock</div>
        <nav>
          <button className={tab==='stock'?'active':''} onClick={()=>setTab('stock')}>📦 Pièces</button>
          <button className={tab==='labels'?'active':''} onClick={()=>setTab('labels')}>🏷️ Étiquettes</button>
          <button className={tab==='movements'?'active':''} onClick={()=>setTab('movements')}>🔁 Mouvements</button>
          <button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>🧾 Commandes</button>
        </nav>

        <div className="menu-title">Gestion</div>
        <nav>
          <button className={tab==='prices'?'active':''} onClick={()=>setTab('prices')}>💶 Tarifs réparation</button>
          <button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>🔐 Admin</button>
        </nav>
      </div>

      <div className="role-box">
        <strong>{isAdmin?'Abdel / Mohamed':'Équipe'}</strong>
        <span>{session.user.email}</span>
        <button onClick={logout}>Déconnexion</button>
      </div>
    </aside>

    <main className="main">
      <header>
        <div>
          <h2>{title(tab)}</h2>
          <p>Application cloud connectée à Supabase.</p>
        </div>
        <input className="search" placeholder="Recherche globale : client, IMEI, ticket, pièce..." value={query} onChange={e=>setQuery(e.target.value)} />
      </header>

      {alerts.length>0 && <div className="alert">⚠️ Stock critique : {alerts.map(a=>`${a.ref} (${a.location})`).join(' • ')}</div>}

      {tab==='dashboard' && <>
        <section className="kpis">
          <div><small>Appareils reçus</small><strong>{activeRepairs.length}</strong><em>En atelier</em></div>
          <div><small>Réparations actives</small><strong>{activeRepairs.length}</strong><em>Hors livré/annulé</em></div>
          <div><small>Pièces tracées</small><strong>{parts.length}</strong><em>Référencées</em></div>
          <div><small>Stock critique</small><strong>{alerts.length}</strong><em>À commander</em></div>
          <div><small>Marge estimée</small><strong>{isAdmin?money(margin):'Masqué'}</strong><em>Admin</em></div>
        </section>

        <section className="grid">
          <div className="card">
            <div className="section-header">
              <h3>Réparations prioritaires</h3>
              <button onClick={()=>setTab('repairs')}>Ouvrir</button>
            </div>
            {filteredRepairs.slice(0,6).map(r=><div className="line" key={r.id}>
              <strong>{r.ticket_ref}</strong>
              <span>{r.clients?.full_name || '-'} — {r.devices?.model || '-'} — {r.status}</span>
            </div>)}
            {!filteredRepairs.length && <p>Aucune réparation.</p>}
          </div>

          <div className="card">
            <h3>Traçabilité rapide</h3>
            <div className="mini-grid">
              <div><small>Écrans</small><strong>{screenStock}</strong></div>
              <div><small>Batteries</small><strong>{batteryStock}</strong></div>
              <div><small>Autres</small><strong>{otherStock}</strong></div>
            </div>
            <h3 className="mt">Notifications</h3>
            {alerts.slice(0,4).map(p=><div className="line amber" key={p.id}>{p.ref} — stock {p.stock}</div>)}
            {!alerts.length && <p>Aucune notification.</p>}
          </div>
        </section>
      </>}

      {tab==='repairs' && <section>
        <div className="section-header">
          <div><h3>Réparations clients</h3><p>Chaque réparation crée un appareil reçu + sortie automatique de stock si une pièce est choisie.</p></div>
          <button className="green" onClick={()=>setShowRepairForm(!showRepairForm)}>+ Ajouter réparation</button>
        </div>

        {showRepairForm && <div className="card">
          <h3>Nouvelle réparation</h3>
          <form className="form" onSubmit={createRepair}>
            <input name="client" placeholder="Client" required />
            <input name="phone" placeholder="Téléphone" />
            <input name="email" placeholder="Email" />
            <input name="device" placeholder="Appareil / modèle" required />
            <input name="imei" placeholder="IMEI / Série" />
            <input name="color" placeholder="Couleur" />
            <input name="battery_level" type="number" placeholder="Batterie %" />
            <select name="condition_received"><option>Bon état</option><option>Écran cassé</option><option>Ne s’allume pas</option><option>Oxydation suspectée</option></select>
            <input name="issue" placeholder="Panne" />
            <select name="part_id"><option value="">Aucune pièce</option>{parts.map(p=><option key={p.id} value={p.id}>{p.ref} — stock {p.stock}</option>)}</select>
            <input name="technician" placeholder="Technicien" />
            <select name="priority"><option>Normale</option><option>Haute</option><option>Urgente</option></select>
            <select name="status">{statuses.map(s=><option key={s}>{s}</option>)}</select>
            <input name="price_ttc" type="number" placeholder="Prix client TTC" />
            <textarea name="notes" placeholder="Notes internes" />
            <button>Créer réparation</button>
          </form>
        </div>}

        <div className="card table-card">
          <h3>Liste réparations</h3>
          <table>
            <thead><tr><th>Ticket</th><th>Client</th><th>Appareil</th><th>IMEI</th><th>Statut</th><th>Prix</th><th>Actions</th></tr></thead>
            <tbody>{filteredRepairs.map(r=><tr key={r.id}>
              <td><strong>{r.ticket_ref}</strong></td>
              <td>{r.clients?.full_name}</td>
              <td>{r.devices?.model}</td>
              <td>{r.devices?.imei || '-'}</td>
              <td><select value={r.status} onChange={e=>updateRepairStatus(r,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></td>
              <td>{money(r.price_ttc)}</td>
              <td className="actions-cell">{isAdmin && <button onClick={()=>updateRepairPrice(r)}>Prix</button>}{isAdmin && <button className="danger" onClick={()=>deleteRepair(r)}>Supprimer</button>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}

      {tab==='devices' && <section className="cards-grid">
        {filteredRepairs.map(r=><div className="card device-card" key={r.id}>
          <div className="section-header"><div><h3>{r.devices?.device_tag || 'Appareil'}</h3><p>Appareil client reçu</p></div><div className="qr"></div></div>
          <div className="mini-grid two">
            <div><small>Client</small><strong>{r.clients?.full_name || '-'}</strong></div>
            <div><small>Ticket</small><strong>{r.ticket_ref}</strong></div>
            <div><small>Modèle</small><strong>{r.devices?.model || '-'}</strong></div>
            <div><small>IMEI</small><strong>{r.devices?.imei || '-'}</strong></div>
            <div><small>État</small><strong>{r.devices?.condition_received || '-'}</strong></div>
            <div><small>Batterie</small><strong>{r.devices?.battery_level ?? '-'}%</strong></div>
          </div>
        </div>)}
      </section>}

      {tab==='tickets' && <section className="cards-grid">
        {filteredRepairs.map(r=><div className="card ticket-card" key={r.id}>
          <div className="section-header"><div><h3>{r.ticket_ref}</h3><p>Ticket atelier automatique</p></div><div className="qr"></div></div>
          <p><strong>Client :</strong> {r.clients?.full_name || '-'}</p>
          <p><strong>Appareil :</strong> {r.devices?.model || '-'}</p>
          <p><strong>IMEI :</strong> {r.devices?.imei || '-'}</p>
          <p><strong>Statut :</strong> {r.status}</p>
        </div>)}
      </section>}

      {tab==='stock' && <section>
        <div className="section-header">
          <div><h3>Stock pièces étiqueté</h3><p>Référence automatique, modèle simplifié, type de pièce libre si besoin.</p></div>
          {isAdmin && <button className="green" onClick={()=>setShowStockForm(!showStockForm)}>+ Ajouter pièce</button>}
        </div>

        {showStockForm && isAdmin && <div className="card">
          <h3>Nouvelle pièce</h3>
          <form className="form" onSubmit={createPart}>
            <input name="model" placeholder="Modèle / appareil ex: iPhone 13" required />
            <select name="category" value={stockCategory} onChange={e=>setStockCategory(e.target.value)}>
              <option>Batterie</option>
              <option>Écran</option>
              <option>HP</option>
              <option>Micro</option>
              <option>Caméra</option>
              <option>Connecteur charge</option>
              <option>Vitre arrière</option>
              <option>Face ID</option>
              <option>Autre</option>
            </select>
            {stockCategory === 'Autre' && <input name="custom_category" placeholder="Écrire le type de pièce" required />}
            <input name="quality" placeholder="Qualité (facultatif)" />
            <input name="location" placeholder="Emplacement (facultatif)" />
            <input name="supplier" placeholder="Fournisseur (facultatif)" />
            <input name="stock" type="number" placeholder="Stock" />
            <input name="min_stock" type="number" placeholder="Seuil alerte" />
            <input name="purchase_price_ht" type="number" placeholder="Prix HT" />
            <input name="purchase_price_ttc" type="number" placeholder="Prix TTC" />
            <button>Ajouter pièce</button>
          </form>
        </div>}

        <div className="card table-card">
          <h3>Stock pièces</h3>
          <table>
            <thead><tr><th>Étiquette</th><th>Modèle</th><th>Catégorie</th><th>Emplacement</th><th>Stock</th><th>Prix achat</th><th>Actions admin</th></tr></thead>
            <tbody>{filteredParts.map(p=><tr key={p.id}>
              <td><strong>{p.ref}</strong></td>
              <td>{p.model}</td>
              <td>{p.category}</td>
              <td>{p.location}</td>
              <td><strong className={Number(p.stock)<=Number(p.min_stock)?'bad':'good'}>{p.stock}</strong></td>
              <td>{isAdmin?money(p.purchase_price_ttc):'Masqué'}</td>
              <td className="actions-cell">{isAdmin ? <>
                <button onClick={()=>updatePartStock(p,Number(p.stock)+1,'+1 stock manuel')}>+1</button>
                <button onClick={()=>updatePartStock(p,Number(p.stock)-1,'-1 stock manuel')}>-1</button>
                <button onClick={()=>setPartStock(p)}>Modifier</button>
                <button onClick={()=>toggleAlert(p)}>{p.alert_hidden?'Réactiver alerte':'Masquer alerte'}</button>
                <button className="danger" onClick={()=>deletePart(p)}>Supprimer</button>
              </> : 'Lecture seule'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}

      {tab==='labels' && <section className="cards-grid">
        {filteredParts.map(p=><div className="card label-card" key={p.id}><div className="section-header"><div><h3>{p.ref}</h3><p>{p.category} — {p.model}</p><p>Emplacement : {p.location || '-'}</p></div><div className="qr"></div></div></div>)}
      </section>}

      {tab==='movements' && <div className="card">
        <h3>Mouvements de stock</h3>
        {movements.map(m=><div className="timeline" key={m.id}><span></span><p><strong>{m.movement_type} — {m.quantity}</strong><br />{m.parts?.ref || ''} {m.note ? `• ${m.note}` : ''}</p></div>)}
        {!movements.length && <p>Aucun mouvement.</p>}
      </div>}

      {tab==='orders' && <div className="card table-card">
        <h3>Commandes à préparer</h3>
        <table>
          <thead><tr><th>Réf</th><th>Pièce</th><th>Modèle</th><th>Stock</th><th>Seuil</th><th>Fournisseur</th><th>Emplacement</th></tr></thead>
          <tbody>{alerts.map(p=><tr key={p.id}><td>{p.ref}</td><td>{p.category}</td><td>{p.model}</td><td>{p.stock}</td><td>{p.min_stock}</td><td>{p.supplier || '-'}</td><td>{p.location || '-'}</td></tr>)}</tbody>
        </table>
      </div>}

      {tab==='prices' && <div className="card table-card">
        <h3>Tarifs réparation iPhone</h3>
        <table>
          <thead><tr><th>Modèle</th><th>Écran compatible</th><th>Écran premium</th><th>Écran original</th><th>Batterie compatible</th><th>Batterie premium</th></tr></thead>
          <tbody>{filteredPrices.map(p=><tr key={p.id}>
            <td><strong>{p.model}</strong></td>
            <td onDoubleClick={()=>updatePriceRow(p,'screen_compatible')}>{money(p.screen_compatible)}</td>
            <td onDoubleClick={()=>updatePriceRow(p,'screen_premium')}>{money(p.screen_premium)}</td>
            <td onDoubleClick={()=>updatePriceRow(p,'screen_original')}>{money(p.screen_original)}</td>
            <td onDoubleClick={()=>updatePriceRow(p,'battery_compatible')}>{money(p.battery_compatible)}</td>
            <td onDoubleClick={()=>updatePriceRow(p,'battery_premium')}>{money(p.battery_premium)}</td>
          </tr>)}</tbody>
        </table>
        {isAdmin && <p className="hint">Astuce admin : double-clique sur un prix pour le modifier.</p>}
      </div>}

      {tab==='clients' && <section className="cards-grid">
        {filteredClients.map(c=><div className="card" key={c.id}><h3>{c.full_name}</h3><div className="mini-grid two"><div><small>Téléphone</small><strong>{c.phone || '-'}</strong></div><div><small>Email</small><strong>{c.email || '-'}</strong></div></div></div>)}
      </section>}

      {tab==='notifications' && <section className="cards-grid">
        {alerts.map(p=><div className="card" key={p.id}><span className="badge red">Stock critique</span><h3>{p.ref}</h3><p>{p.category} — {p.model} — stock {p.stock}</p></div>)}
        {!alerts.length && <div className="card"><h3>Aucune notification</h3><p>Tout est à jour.</p></div>}
      </section>}

      {tab==='admin' && <div className="card">
        <h3>Admin</h3>
        <div className="mini-grid two">
          <div><small>Rôle actuel</small><strong>{profile?.role}</strong></div>
          <div><small>Compte</small><strong>{session.user.email}</strong></div>
          <div><small>Prix achat</small><strong>{isAdmin?'Visible':'Masqué'}</strong></div>
          <div><small>Suppression</small><strong>{isAdmin?'Oui':'Non'}</strong></div>
        </div>
        <br />
        <button onClick={loadAll}>Rafraîchir les données</button>
      </div>}
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
