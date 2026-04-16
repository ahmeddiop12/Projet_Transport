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

// Map marque → URL logo officiel
const BRAND_LOGOS = {
  'Toyota':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Toyota_carlogo.svg/240px-Toyota_carlogo.svg.png',
  'Mercedes':  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Mercedes-Logo.svg/240px-Mercedes-Logo.svg.png',
  'Renault':   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Renault_2021_Text.svg/320px-Renault_2021_Text.svg.png',
  'Peugeot':   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Peugeot_logo_2021.svg/240px-Peugeot_logo_2021.svg.png',
  'Daewoo':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Daewoo_logo.svg/240px-Daewoo_logo.svg.png',
  'Hyundai':   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Hyundai_Motor_Company_logo.svg/240px-Hyundai_Motor_Company_logo.svg.png',
  'Volkswagen':'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Volkswagen_logo_2019.svg/240px-Volkswagen_logo_2019.svg.png',
  'Ford':      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Ford_logo_flat.svg/240px-Ford_logo_flat.svg.png',
};

function preloadLogos(brands) {
  const imgMap = {};
  const promises = brands.map(brand => {
    const url = BRAND_LOGOS[brand];
    if (!url) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { imgMap[brand] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = url;
    });
  });
  return Promise.all(promises).then(() => imgMap);
}

function buildLogoPlugin(imgMap, logoSize = 40) {
  return {
    id: 'brandLogos',
    afterDraw(chart) {
      const { ctx, scales: { x } } = chart;
      chart.data.labels.forEach((label, i) => {
        const img = imgMap[label];
        const xPos = x.getPixelForTick(i);
        const yPos = x.bottom + 8;
        if (img) {
          ctx.drawImage(img, xPos - logoSize / 2, yPos, logoSize, logoSize);
        } else {
          // Fallback: afficher le texte si pas de logo
          ctx.save();
          ctx.fillStyle = chart.options.scales.x.ticks.color === 'transparent'
            ? (document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a')
            : '#0f172a';
          ctx.font = "bold 12px 'Outfit', sans-serif";
          ctx.textAlign = 'center';
          ctx.fillText(label, xPos, yPos + 14);
          ctx.restore();
        }
      });
    }
  };
}

function renderVehiculesChart(data) {
  const counts = {};
  data.forEach(v => {
    const marque = v.marque || 'Inconnue';
    counts[marque] = (counts[marque] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = Object.values(counts);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  Chart.defaults.color = isDark ? '#f8fafc' : '#0f172a';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  const ctx = document.getElementById('marquesChart');
  if (!ctx) return;
  if (chartMarques) chartMarques.destroy();

  const COLORS = [
    '#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'
  ];

  preloadLogos(labels).then(imgMap => {
    chartMarques = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Nombre de véhicules',
          data: values,
          backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]),
          borderRadius: 10,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 56 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => ` ${c.raw} véhicule${c.raw > 1 ? 's' : ''}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
          },
          x: {
            grid: { display: false },
            ticks: { color: 'transparent', maxRotation: 0 }
          }
        }
      },
      plugins: [buildLogoPlugin(imgMap, 40)]
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadVehicules();
});
