// ===== CHAUFFEURS =====
let allChauffeurs = [];

// Prénoms féminins sénégalais et africains courants
const PRENOMS_FEMININS = [
  'aminata','fatou','mariam','mariama','aissatou','rokhaya','nabou','ndèye','ndeye',
  'coumba','adja','astou','binta','seynabou','khady','mame','safiétou','safietou',
  'oumou','fatoumata','hawa','kadiatou','ramatoulaye','rama','yaye','sokhna',
  'dieynaba','dieynabou','fanta','korotoumou','maimouna','nafi','oumy','penda',
  'diabou','ndéye','ndaye','awa','awo','bineta','cogné','gnima','yacine','zeynab'
];

function isFemale(prenom) {
  return PRENOMS_FEMININS.includes((prenom || '').toLowerCase().trim());
}

function getAvatarFor(prenom, nom) {
  if (isFemale(prenom)) {
    return {
      src: 'static/driver_avatar_female.png',
      fallback: `https://ui-avatars.com/api/?name=${encodeURIComponent(prenom+'+'+nom)}&size=120&background=ec4899&color=fff&bold=true`
    };
  }
  return {
    src: 'static/driver_avatar.png',
    fallback: `https://ui-avatars.com/api/?name=${encodeURIComponent(prenom+'+'+nom)}&size=120&background=4f46e5&color=fff&bold=true`
  };
}


// ── MODAL DÉTAIL ─────────────────────────────────────────────
function openChauffeurDetail(c) {
  const existing = document.getElementById('chauffeur-modal-overlay');
  if (existing) existing.remove();

  // Ancienneté calculée
  let ancienneteLabel = '—';
  if (c.date_embauche) {
    const d = new Date(c.date_embauche);
    if (!isNaN(d)) {
      const now = new Date();
      const totalMois = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      const ans = Math.floor(totalMois / 12);
      const mois = totalMois % 12;
      ancienneteLabel = (ans > 0 ? ans + (ans > 1 ? ' ans ' : ' an ') : '') + (mois > 0 ? mois + ' mois' : '');
    }
  }

  const dispoColor = c.disponibilite ? '#10b981' : '#ef4444';
  const dispoLabel = c.disponibilite ? '✅ Disponible' : '❌ Non disponible';

  const overlay = document.createElement('div');
  overlay.id = 'chauffeur-modal-overlay';
  overlay.innerHTML = `
    <div class="cmodal-box" id="cmodal-box">
      <!-- En-tête -->
      <div class="cmodal-header">
        <button class="cmodal-close" onclick="document.getElementById('chauffeur-modal-overlay').remove()">✖</button>
      </div>

      <!-- Photo + nom -->
      <div class="cmodal-hero">
        <div class="cmodal-avatar-wrap">
          <img
            src="${getAvatarFor(c.prenom, c.nom).src}"
            alt="Photo chauffeur"
            class="cmodal-avatar"
            onerror="this.src='${getAvatarFor(c.prenom, c.nom).fallback}'"
          />
          <div class="cmodal-dispo-dot ${c.disponibilite ? 'dispo' : 'indispo'}"></div>
        </div>
        <div class="cmodal-hero-info">
          <h2 class="cmodal-name">${escHtml(c.prenom)} ${escHtml(c.nom)}</h2>
          <div class="cmodal-dispo-badge" style="color:${dispoColor}">${dispoLabel}</div>
          ${c.vehicule ? `<div class="cmodal-vehicule">🚌 ${escHtml(c.vehicule)} <span style="color:var(--muted);font-size:0.8rem">(${escHtml(c.type_vehicule||'')})</span></div>` : ''}
        </div>
      </div>

      <!-- Informations détaillées -->
      <div class="cmodal-grid">
        <div class="cmodal-info-item">
          <span class="cmodal-info-icon">📞</span>
          <div>
            <div class="cmodal-info-label">Téléphone</div>
            <div class="cmodal-info-value">${escHtml(c.telephone||'—')}</div>
          </div>
        </div>
        <div class="cmodal-info-item">
          <span class="cmodal-info-icon">🪪</span>
          <div>
            <div class="cmodal-info-label">N° Permis</div>
            <div class="cmodal-info-value">${escHtml(c.numero_permis||'—')}</div>
          </div>
        </div>
        <div class="cmodal-info-item">
          <span class="cmodal-info-icon">🏷️</span>
          <div>
            <div class="cmodal-info-label">Catégorie permis</div>
            <div class="cmodal-info-value">${escHtml(c.categorie_permis||'—')}</div>
          </div>
        </div>
        <div class="cmodal-info-item">
          <span class="cmodal-info-icon">📅</span>
          <div>
            <div class="cmodal-info-label">Date d'embauche</div>
            <div class="cmodal-info-value">${c.date_embauche ? new Date(c.date_embauche).toLocaleDateString('fr-FR') : '—'}</div>
          </div>
        </div>
        <div class="cmodal-info-item">
          <span class="cmodal-info-icon">⏳</span>
          <div>
            <div class="cmodal-info-label">Ancienneté</div>
            <div class="cmodal-info-value">${ancienneteLabel || '< 1 mois'}</div>
          </div>
        </div>
        <div class="cmodal-info-item">
          <span class="cmodal-info-icon">🆔</span>
          <div>
            <div class="cmodal-info-label">ID Chauffeur</div>
            <div class="cmodal-info-value">#${c.id}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fermer au clic dehors
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  // Forcer animation en entrée
  requestAnimationFrame(() => {
    document.getElementById('cmodal-box').classList.add('open');
  });
}

// ── CHARGEMENT ───────────────────────────────────────────────
async function loadChauffeurs() {
  const cols = ['Photo', 'Nom & Prénom', 'Téléphone', 'Permis', 'Catégorie', 'Véhicule', 'Embauche', 'Dispo'];
  document.getElementById('chauffeurs-table').innerHTML = skeletonTable(cols, 6);

  try {
    const data = await fetch(API + '/api/chauffeurs').then(r => r.json());
    allChauffeurs = data;

    document.getElementById('chauffeurs-table').innerHTML = `
      <table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${data.map((c, i) => {
          let embaucheLabel = '—';
          if (c.date_embauche) {
            const d = new Date(c.date_embauche);
            if (!isNaN(d)) embaucheLabel = d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0');
          }
          return `
          <tr class="animate-row chauffeur-row" data-id="${i}" style="cursor:pointer;" title="Cliquer pour voir les détails">
            <td>
              <img
                src="${getAvatarFor(c.prenom, c.nom).src}"
                alt="${escHtml(c.prenom)}"
                class="chauffeur-thumb"
                onerror="this.src='${getAvatarFor(c.prenom, c.nom).fallback}'"
              />
            </td>
            <td><strong>${escHtml(c.prenom)} ${escHtml(c.nom)}</strong></td>
            <td>${escHtml(c.telephone||'—')}</td>
            <td><code>${escHtml(c.numero_permis)}</code></td>
            <td>${escHtml(c.categorie_permis||'—')}</td>
            <td>${c.vehicule ? `<span class="badge badge-actif">${escHtml(c.vehicule)}</span>` : '<span style="color:var(--muted)">—</span>'}</td>
            <td>${embaucheLabel}</td>
            <td>${c.disponibilite ? '<span style="color:#10b981;font-size:1.1rem;">●</span> Oui' : '<span style="color:#ef4444;font-size:1.1rem;">●</span> Non'}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;

    // Attacher les clics sur chaque ligne
    document.querySelectorAll('.chauffeur-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-id'));
        openChauffeurDetail(allChauffeurs[idx]);
      });
    });

    renderChauffeursChart(data);
  } catch (e) {
    document.getElementById('chauffeurs-table').innerHTML =
      `<p style="color:var(--danger);padding:2rem;">❌ Erreur de chargement des chauffeurs.</p>`;
  }
}

// ── GRAPHIQUE ─────────────────────────────────────────────────
function renderChauffeursChart(data) {
  const now = new Date();
  const chauffeurs = data.map(c => {
    const embauche = c.date_embauche ? new Date(c.date_embauche) : null;
    const mois = (embauche && !isNaN(embauche))
      ? Math.max(0, (now.getFullYear() - embauche.getFullYear()) * 12 + (now.getMonth() - embauche.getMonth()))
      : 0;
    return { nom: c.prenom + ' ' + c.nom, mois };
  }).sort((a, b) => b.mois - a.mois);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  Chart.defaults.color = isDark ? '#f8fafc' : '#0f172a';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  const ctx = document.getElementById('ancienneteChart');
  if (!ctx) return;
  if (window.chartAnciennete) window.chartAnciennete.destroy();

  window.chartAnciennete = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chauffeurs.map(c => c.nom),
      datasets: [{
        label: "Mois d'ancienneté",
        data: chauffeurs.map(c => c.mois),
        backgroundColor: chauffeurs.map((_, i) =>
          `hsl(${160 + i * 18}, 70%, ${isDark ? 45 : 50}%)`),
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const m = ctx.parsed.y;
              const a = Math.floor(m / 12), r = m % 12;
              return ' ' + ((a > 0 ? a + (a > 1 ? ' ans ' : ' an ') : '') + (r > 0 ? r + ' mois' : '')).trim() || '< 1 mois';
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', loadChauffeurs);
