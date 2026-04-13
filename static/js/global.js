// Ajustement dynamique : si ouvert sans serveur (file://), on utilise localhost:8000
const API = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';

// ===== UTILS =====
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-SN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('fr-FR') + ' FCFA';
}

function badge(val) {
  const cls = `badge badge-${val}`;
  const labels = {
    actif:'Actif', maintenance:'Maintenance', hors_service:'Hors service',
    termine:'Terminé', en_cours:'En cours', planifie:'Planifié', annule:'Annulé',
    faible:'Faible', moyen:'Moyen', grave:'Grave',
    panne:'Panne', accident:'Accident', retard:'Retard', autre:'Autre'
  };
  return `<span class="${cls}">${labels[val] || val}</span>`;
}

function tableHTML(data) {
  if (!data || data.length === 0) return '<p style="color:var(--muted);padding:1rem;text-align:center">Aucun résultat</p>';
  const keys = Object.keys(data[0]);
  let html = '<table><thead><tr>' + keys.map(k => `<th>${k}</th>`).join('') + '</tr></thead><tbody>';
  for (const row of data) {
    html += '<tr class="animate-row">' + keys.map(k => {
      const v = row[k];
      if (v === null || v === undefined) return '<td>—</td>';
      // Auto-badge pour colonnes connues
      if (['statut','gravite','type'].includes(k) && typeof v === 'string') return `<td>${badge(v)}</td>`;
      if (typeof v === 'boolean') return `<td>${v ? '✅' : '❌'}</td>`;
      return `<td>${v}</td>`;
    }).join('') + '</tr>';
  }
  return html + '</tbody></table>';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== DARK MODE =====
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Fonction utilitaire pour générer des squelettes de tableau
function skeletonTable(cols, rowsCount = 5) {
  let html = '<table><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for(let i=0; i<rowsCount; i++) {
    html += '<tr>' + cols.map(() => `<td><div class="skeleton skeleton-text"></div></td>`).join('') + '</tr>';
  }
  return html + '</tbody></table>';
}

document.addEventListener('DOMContentLoaded', initTheme);
