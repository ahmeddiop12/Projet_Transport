// ===== VÉHICULES =====
let allVehicules = [];
let chartMarques = null;

async function loadVehicules(statut = '') {
  // Skeleton loader
  const cols = ['Immatriculation', 'Type', 'Marque/Modèle', 'Capacité', 'Kilométrage', 'Statut', 'Acquisition'];
  document.getElementById('vehicules-table').innerHTML = skeletonTable(cols, 6);

  try {
    const url = statut ? `${API}/api/vehicules?statut=${statut}` : `${API}/api/vehicules`;
    const data = await fetch(url).then(r => r.json());
    allVehicules = data;
    renderVehicules(data, cols);
    renderVehiculesChart(data);
  } catch (e) {
    document.getElementById('vehicules-table').innerHTML = `<p style="color:var(--danger);padding:2rem;">❌ Erreur de chargement des véhicules.</p>`;
  }
}

function filterVehicules(statut) { 
  loadVehicules(statut); 
}

function renderVehicules(data, cols) {
  document.getElementById('vehicules-table').innerHTML = `
    <table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${data.map(v => `
      <tr class="animate-row">
        <td><strong>${v.immatriculation}</strong></td>
        <td>${v.type}</td>
        <td>${v.marque||''} ${v.modele||''}</td>
        <td>${v.capacite} places</td>
        <td>${(v.kilometrage||0).toLocaleString()} km</td>
        <td>${badge(v.statut)}</td>
        <td>${v.date_acquisition || '—'}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function renderVehiculesChart(data) {
  const counts = {};
  data.forEach(v => {
    let marque = v.marque || 'Inconnue';
    counts[marque] = (counts[marque] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = Object.values(counts);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  Chart.defaults.color = isDark ? '#f8fafc' : '#0f172a';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  const ctx = document.getElementById('marquesChart');
  if(!ctx) return;

  if (chartMarques) chartMarques.destroy();
  
  chartMarques = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Nombre de véhicules',
        data: values,
        backgroundColor: '#4f46e5',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadVehicules();
});
