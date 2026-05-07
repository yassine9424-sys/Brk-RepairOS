import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import './styles.css'

const statuses = ['Reçu', 'Diagnostic', 'En attente client', 'En attente pièce', 'Prêt à réparer', 'En réparation', 'Réparé', 'Livré', 'Annulé']

function money(v) {
  if (v === null || v === undefined || v === '') return '-'
  return `${Number(v).toFixed(2).replace('.', ',')} €`
}

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [parts, setParts] = useState([])
  const [repairs, setRepairs] = useState([])
  const [prices, setPrices] = useState([])
  const [clients, setClients] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) {
      loadAll()
    }
  }, [session])

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  async function loadAll() {
    setLoading(true)
    const userId = (await supabase.auth.getUser()).data.user?.id

    const [profileRes, partsRes, repairsRes, pricesRes, clientsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('parts').select('*').order('created_at', { ascending: false }),
      supabase.from('repairs').select('*, clients(full_name, phone), devices(device_tag, model, imei)').order('created_at', { ascending: false }),
      supabase.from('repair_prices').select('*').order('model'),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
    ])

    setProfile(profileRes.data)
    setParts(partsRes.data || [])
    setRepairs(repairsRes.data || [])
    setPrices(pricesRes.data || [])
    setClients(clientsRes.data || [])
    setLoading(false)
  }

  async function createPart(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const ref = form.get('ref') || `${form.get('category')?.slice(0,3)}-${form.get('model')?.replaceAll(' ', '').slice(0,7)}-${form.get('location')?.replaceAll(' ', '').slice(0,3)}`.toUpperCase()

    const { error } = await supabase.from('parts').insert({
      ref,
      product: form.get('product'),
      model: form.get('model'),
      category: form.get('category'),
      quality: form.get('quality'),
      location: form.get('location'),
      supplier: form.get('supplier'),
      stock: Number(form.get('stock') || 0),
      min_stock: Number(form.get('min_stock') || 0),
      purchase_price_ht: Number(form.get('purchase_price_ht') || 0),
      purchase_price_ttc: Number(form.get('purchase_price_ttc') || 0),
    })
    if (error) alert(error.message)
    e.currentTarget.reset()
    loadAll()
  }

  async function createRepair(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const clientName = form.get('client')
    const phone = form.get('phone')
    const deviceModel = form.get('device')
    const imei = form.get('imei')
    const partId = form.get('part_id') || null
    const ticket = `BRK-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    const deviceTag = `DEV-BRK-${String(Date.now()).slice(-5)}`

    let clientId = null
    let deviceId = null
    let partCost = 0

    const clientRes = await supabase.from('clients').insert({ full_name: clientName, phone }).select().single()
    if (clientRes.error) return alert(clientRes.error.message)
    clientId = clientRes.data.id

    const deviceRes = await supabase.from('devices').insert({
      device_tag: deviceTag,
      client_id: clientId,
      model: deviceModel,
      imei,
      color: form.get('color'),
      condition_received: form.get('condition_received'),
      battery_level: Number(form.get('battery_level') || 0),
    }).select().single()
    if (deviceRes.error) return alert(deviceRes.error.message)
    deviceId = deviceRes.data.id

    if (partId) {
      const part = parts.find(p => p.id === partId)
      partCost = Number(part?.purchase_price_ttc || 0)
      await supabase.from('parts').update({ stock: Math.max(0, Number(part.stock) - 1), alert_hidden: false }).eq('id', partId)
    }

    const repairRes = await supabase.from('repairs').insert({
      ticket_ref: ticket,
      client_id: clientId,
      device_id: deviceId,
      part_id: partId,
      issue: form.get('issue'),
      status: form.get('status'),
      priority: form.get('priority'),
      technician: form.get('technician'),
      price_ttc: Number(form.get('price_ttc') || 0),
      part_cost_ttc: partCost,
      notes: form.get('notes'),
    }).select().single()
    if (repairRes.error) return alert(repairRes.error.message)

    if (partId) {
      await supabase.from('stock_movements').insert({
        part_id: partId,
        repair_id: repairRes.data.id,
        movement_type: 'sortie',
        quantity: 1,
        note: `Sortie automatique pour ${ticket}`,
      })
    }

    e.currentTarget.reset()
    loadAll()
  }

  const alerts = parts.filter(p => Number(p.stock) <= Number(p.min_stock || 0) && !p.alert_hidden)
  const activeRepairs = repairs.filter(r => !['Livré', 'Annulé'].includes(r.status))
  const turnover = repairs.reduce((s, r) => s + Number(r.price_ttc || 0), 0)
  const margin = repairs.reduce((s, r) => s + Number(r.price_ttc || 0) - Number(r.part_cost_ttc || 0), 0)

  const filteredParts = parts.filter(p => JSON.stringify(p).toLowerCase().includes(query.toLowerCase()))
  const filteredRepairs = repairs.filter(r => JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))
  const filteredPrices = prices.filter(p => JSON.stringify(p).toLowerCase().includes(query.toLowerCase()))

  if (!session) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={login}>
          <div className="brand">
            <h1>BRK RepairOS</h1>
            <p>Réparez. Suivez. Contrôlez.</p>
          </div>
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button disabled={loading}>{loading ? 'Connexion...' : 'Connexion'}</button>
          {message && <p className="error">{message}</p>}
        </form>
      </main>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>BRK RepairOS</h1>
          <p>Réparez. Suivez. Contrôlez.</p>
        </div>
        <nav>
          {['dashboard','repairs','parts','prices','clients','admin'].map(item => (
            <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
              {item === 'dashboard' && '📊 Dashboard'}
              {item === 'repairs' && '🛠️ Réparations'}
              {item === 'parts' && '📦 Stock pièces'}
              {item === 'prices' && '💶 Tarifs réparation'}
              {item === 'clients' && '👤 Clients'}
              {item === 'admin' && '🔐 Admin'}
            </button>
          ))}
        </nav>
        <div className="role-box">
          <strong>{profile?.role === 'admin' ? 'Abdel / Mohamed' : 'Équipe'}</strong>
          <span>{session.user.email}</span>
          <button onClick={logout}>Déconnexion</button>
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <h2>{tab === 'dashboard' ? 'Dashboard' : tab}</h2>
            <p>Application cloud connectée à Supabase.</p>
          </div>
          <input className="search" placeholder="Recherche globale..." value={query} onChange={e => setQuery(e.target.value)} />
        </header>

        {alerts.length > 0 && <div className="alert">⚠️ Stock critique : {alerts.map(a => `${a.ref} (${a.location})`).join(' • ')}</div>}

        {tab === 'dashboard' && (
          <>
            <section className="kpis">
              <div><small>Réparations actives</small><strong>{activeRepairs.length}</strong></div>
              <div><small>Pièces stock</small><strong>{parts.length}</strong></div>
              <div><small>Alertes stock</small><strong>{alerts.length}</strong></div>
              <div><small>CA estimé</small><strong>{money(turnover)}</strong></div>
              <div><small>Marge</small><strong>{isAdmin ? money(margin) : 'Masqué'}</strong></div>
            </section>
            <section className="grid">
              <div className="card">
                <h3>Dernières réparations</h3>
                {repairs.slice(0,5).map(r => <div className="line" key={r.id}>{r.ticket_ref} — {r.devices?.model} — {r.status}</div>)}
              </div>
              <div className="card">
                <h3>Stock critique</h3>
                {alerts.map(p => <div className="line" key={p.id}>{p.ref} — stock {p.stock}</div>)}
              </div>
            </section>
          </>
        )}

        {tab === 'repairs' && (
          <section>
            <div className="card">
              <h3>Créer une réparation</h3>
              <form className="form" onSubmit={createRepair}>
                <input name="client" placeholder="Client" required />
                <input name="phone" placeholder="Téléphone" />
                <input name="device" placeholder="Appareil / modèle" required />
                <input name="imei" placeholder="IMEI / Série" />
                <input name="color" placeholder="Couleur" />
                <input name="battery_level" type="number" placeholder="Batterie %" />
                <select name="condition_received"><option>Bon état</option><option>Écran cassé</option><option>Ne s’allume pas</option></select>
                <input name="issue" placeholder="Panne" />
                <select name="part_id"><option value="">Aucune pièce</option>{parts.map(p => <option key={p.id} value={p.id}>{p.ref} — stock {p.stock}</option>)}</select>
                <input name="technician" placeholder="Technicien" />
                <select name="priority"><option>Normale</option><option>Haute</option><option>Urgente</option></select>
                <select name="status">{statuses.map(s => <option key={s}>{s}</option>)}</select>
                <input name="price_ttc" type="number" placeholder="Prix client TTC" />
                <textarea name="notes" placeholder="Notes internes" />
                <button>Créer + sortir la pièce du stock</button>
              </form>
            </div>
            <div className="card">
              <h3>Liste réparations</h3>
              <table><tbody>{filteredRepairs.map(r => <tr key={r.id}><td>{r.ticket_ref}</td><td>{r.clients?.full_name}</td><td>{r.devices?.model}</td><td>{r.status}</td><td>{money(r.price_ttc)}</td></tr>)}</tbody></table>
            </div>
          </section>
        )}

        {tab === 'parts' && (
          <section>
            {isAdmin && <div className="card">
              <h3>Ajouter une pièce</h3>
              <form className="form" onSubmit={createPart}>
                <input name="ref" placeholder="Référence interne auto ou manuelle" />
                <input name="product" placeholder="Produit ex: iPhone" />
                <input name="model" placeholder="Modèle" required />
                <select name="category"><option>Batterie</option><option>Écran</option><option>HP</option><option>Micro</option><option>Caméra</option><option>Connecteur charge</option><option>Autre</option></select>
                <input name="quality" placeholder="Qualité" />
                <input name="location" placeholder="Emplacement" />
                <input name="supplier" placeholder="Fournisseur" />
                <input name="stock" type="number" placeholder="Stock" />
                <input name="min_stock" type="number" placeholder="Seuil alerte" />
                <input name="purchase_price_ht" type="number" placeholder="Prix HT" />
                <input name="purchase_price_ttc" type="number" placeholder="Prix TTC" />
                <button>Ajouter pièce</button>
              </form>
            </div>}
            <div className="card">
              <h3>Stock pièces</h3>
              <table><tbody>{filteredParts.map(p => <tr key={p.id}><td>{p.ref}</td><td>{p.model}</td><td>{p.category}</td><td>{p.location}</td><td>{p.stock}</td><td>{isAdmin ? money(p.purchase_price_ttc) : 'Masqué'}</td></tr>)}</tbody></table>
            </div>
          </section>
        )}

        {tab === 'prices' && (
          <div className="card">
            <h3>Tarifs réparation iPhone</h3>
            <table>
              <thead><tr><th>Modèle</th><th>Écran compatible</th><th>Écran premium</th><th>Écran original</th><th>Batterie compatible</th><th>Batterie premium</th></tr></thead>
              <tbody>{filteredPrices.map(p => <tr key={p.id}><td>{p.model}</td><td>{money(p.screen_compatible)}</td><td>{money(p.screen_premium)}</td><td>{money(p.screen_original)}</td><td>{money(p.battery_compatible)}</td><td>{money(p.battery_premium)}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {tab === 'clients' && (
          <div className="card">
            <h3>Clients</h3>
            <table><tbody>{clients.map(c => <tr key={c.id}><td>{c.full_name}</td><td>{c.phone}</td><td>{c.email}</td></tr>)}</tbody></table>
          </div>
        )}

        {tab === 'admin' && (
          <div className="card">
            <h3>Admin</h3>
            <p>Rôle actuel : <strong>{profile?.role}</strong></p>
            <p>Les suppressions et la gestion stock sensible sont réservées aux admins via les règles Supabase.</p>
          </div>
        )}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
