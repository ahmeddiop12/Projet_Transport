// ===== INCIDENTS =====
const colonnesIncidents = ['Type', 'Gravité', 'Description', 'Chauffeur', 'Véhicule', 'Date', 'Résolu', 'Coût'];

async function loadIncidents(resolu = null) {
  document.getElementById('incidents-table').innerHTML = skeletonTable(colonnesIncidents, 6);
  try {
    const url = resolu !== null ? `${API}/api/incidents?resolu=${resolu}` : `${API}/api/incidents`;
    const data = await fetch(url).then(r => r.json());
    filterIncidents(resolu, data);
  } catch (e) {
    document.getElementById('incidents-table').innerHTML = `<p style="color:var(--danger);padding:2rem;">❌ Erreur de chargement des incidents.</p>`;
  }
}

function filterIncidents(resolu, data = null) {
  if (data === null) { 
    loadIncidents(resolu); 
    return; 
  }
  document.getElementById('incidents-table').innerHTML = `
    <table><thead><tr>${colonnesIncidents.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${data.map(i => `
      <tr class="animate-row">
        <td>${badge(i.type)}</td>
        <td>${badge(i.gravite)}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${i.description||''}">${i.description||'—'}</td>
        <td>${i.chauffeur}</td>
        <td>${i.immatriculation}</td>
        <td>${fmtDate(i.date_incident)}</td>
        <td>${i.resolu ? '✅' : '❌'}</td>
        <td>${i.cout_reparation ? fmtMoney(i.cout_reparation) : '—'}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadIncidents();
});
