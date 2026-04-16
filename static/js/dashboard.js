// ===== DASHBOARD =====
let chartVehicules = null;
let chartIncidents = null;

async function loadDashboard() {
  const trajetsCols = ['Ligne', 'Chauffeur', 'Départ', 'Passagers', 'Statut'];
  const incidentsCols = ['Type', 'Gravité', 'Chauffeur', 'Date'];

  // Squelettes d'attente
  document.getElementById('recent-trajets').innerHTML = skeletonTable(trajetsCols, 5);
  document.getElementById('open-incidents').innerHTML = skeletonTable(incidentsCols, 5);

  try {
    // 1. KPIs
    const stats = await fetch(API + '/api/stats').then(r => r.json());
    document.getElementById('k-total').textContent     = stats.total_trajets || 0;
    document.getElementById('k-encours').textContent   = stats.trajets_en_cours || 0;
    document.getElementById('k-maintenance').textContent = stats.vehicules_maintenance || 0;
    document.getElementById('k-incidents').textContent  = stats.incidents_ouverts || 0;
    document.getElementById('k-chauffeurs').textContent  = stats.chauffeurs_dispo || 0;
    document.getElementById('k-recette').textContent    = (stats.recette_totale || 0).toLocaleString('fr-FR');
    
    // 2. Trajets Récents
    const trajets = await fetch(API + '/api/trajets/recent?limit=8').then(r => r.json());
    document.getElementById('recent-trajets').innerHTML = `
      <table><thead><tr>${trajetsCols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${trajets.map(t => `
        <tr class="animate-row">
          <td><strong>${t.ligne_code}</strong><br><small style="color:var(--muted)">${t.origine} → ${t.destination}</small></td>
          <td>${t.chauffeur}</td>
          <td>${fmtDate(t.date_heure_depart)}</td>
          <td>${t.nb_passagers}</td>
          <td>${badge(t.statut)}</td>
        </tr>`).join('')}
      </tbody></table>`;
    
    // 3. Incidents non résolus
    const incidents = await fetch(API + '/api/incidents?resolu=false').then(r => r.json());
    if (incidents.length === 0) {
      document.getElementById('open-incidents').innerHTML = '<p style="color:var(--success);text-align:center;padding:2rem">✅ Aucun incident ouvert</p>';
    } else {
      document.getElementById('open-incidents').innerHTML = `
        <table><thead><tr>${incidentsCols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${incidents.map(i => `
          <tr class="animate-row">
            <td>${badge(i.type)}<br><small style="color:var(--muted)">${(i.description||'').substring(0,40)}...</small></td>
            <td>${badge(i.gravite)}</td>
            <td>${i.chauffeur}</td>
            <td>${fmtDate(i.date_incident)}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }

    // 4. Graphiques dynamiques (Charts)
    renderCharts();

  } catch (err) {
    console.error('Dashboard error:', err);
    document.getElementById('recent-trajets').innerHTML = `<p style="color:var(--danger)">Erreur.</p>`;
    document.getElementById('open-incidents').innerHTML = `<p style="color:var(--danger)">Erreur.</p>`;
  }
}

async function renderCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  
  Chart.defaults.color = textColor;
  Chart.defaults.font.family = "'Outfit', sans-serif";

  // Données Véhicules
  const vehis = await fetch(API + '/api/vehicules').then(r => r.json());
  let countV = { actif: 0, maintenance: 0, hors_service: 0 };
  vehis.forEach(v => {
    if(countV[v.statut] !== undefined) countV[v.statut]++;
    else countV[v.statut] = 1;
  });

  const ctxV = document.getElementById('vehiculesChart');
  if(chartVehicules) chartVehicules.destroy();
  chartVehicules = new Chart(ctxV, {
    type: 'doughnut',
    data: {
      labels: ['Actif', 'Maintenance', 'Hors Service'],
      datasets: [{
        data: [countV.actif, countV.maintenance, countV.hors_service],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, animation: { animateScale: true } }
  });

  // Données Incidents
  const incs = await fetch(API + '/api/incidents').then(r => r.json());
  let countI = { faible: 0, moyen: 0, grave: 0 };
  incs.forEach(i => {
    if(countI[i.gravite] !== undefined) countI[i.gravite]++;
  });

  const ctxI = document.getElementById('incidentsChart');
  if(chartIncidents) chartIncidents.destroy();
  chartIncidents = new Chart(ctxI, {
    type: 'pie',
    data: {
      labels: ['Faible', 'Moyen', 'Grave'],
      datasets: [{
        data: [countI.faible||0, countI.moyen||0, countI.grave||0],
        backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, animation: { animateScale: true } }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setInterval(loadDashboard, 60000); // 60s auto refresh
});
