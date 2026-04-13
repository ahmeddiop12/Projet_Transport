// ===== CHAUFFEURS =====
async function loadChauffeurs() {
  // Skeleton loader
  const cols = ['Nom & Prénom', 'Téléphone', 'Permis', 'Catégorie', 'Véhicule', 'Embauche', 'Dispo'];
  document.getElementById('chauffeurs-table').innerHTML = skeletonTable(cols, 6);

  try {
    const data = await fetch(API + '/api/chauffeurs').then(r => r.json());
    document.getElementById('chauffeurs-table').innerHTML = `
      <table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${data.map(c => {
        let embaucheLabel = '—';
        if (c.date_embauche) {
          let d = new Date(c.date_embauche);
          if (!isNaN(d)) {
            embaucheLabel = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0');
          }
        }
        return `
        <tr class="animate-row">
          <td><strong>${c.prenom} ${c.nom}</strong></td>
          <td>${c.telephone||'—'}</td>
          <td>${c.numero_permis}</td>
          <td>${c.categorie_permis||'—'}</td>
          <td>${c.vehicule ? `<span style="font-family:monospace">${c.vehicule}</span>` : '—'}</td>
          <td>${embaucheLabel}</td>
          <td>${c.disponibilite ? '✅' : '❌'}</td>
        </tr>`}).join('')}
      </tbody></table>`;
    renderChauffeursChart(data);
  } catch (e) {
    document.getElementById('chauffeurs-table').innerHTML = `<p style="color:var(--danger);padding:2rem;">❌ Erreur de chargement des chauffeurs.</p>`;
  }
}

function renderChauffeursChart(data) {
  let chauffeurs = [];
  const now = new Date();
  
  data.forEach(c => {
    let embauche = c.date_embauche ? new Date(c.date_embauche) : null;
    let ancienneteMois = 0;
    if (embauche && !isNaN(embauche)) {
      ancienneteMois = (now.getFullYear() - embauche.getFullYear()) * 12 + (now.getMonth() - embauche.getMonth());
    }
    chauffeurs.push({
      nom: c.prenom + ' ' + c.nom,
      mois: Math.max(0, ancienneteMois)
    });
  });

  chauffeurs.sort((a, b) => b.mois - a.mois);

  const labels = chauffeurs.map(c => c.nom);
  const values = chauffeurs.map(c => c.mois);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  Chart.defaults.color = isDark ? '#f8fafc' : '#0f172a';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  const ctx = document.getElementById('ancienneteChart');
  if(!ctx) return;

  if (window.chartAnciennete) window.chartAnciennete.destroy();
  
  window.chartAnciennete = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: "Mois d'ancienneté",
        data: values,
        backgroundColor: '#10b981',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              let m = context.parsed.y;
              let a = Math.floor(m / 12);
              let restM = m % 12;
              let txt = '';
              if (a > 0) txt += a + (a > 1 ? ' ans ' : ' an ');
              if (restM > 0) txt += restM + ' mois';
              return txt.trim() || '< 1 mois';
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadChauffeurs();
});
