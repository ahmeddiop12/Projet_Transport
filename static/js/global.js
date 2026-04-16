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
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Fonction utilitaire pour générer des squelettes de tableau
function skeletonTable(cols, rowsCount = 5) {
  let html = '<table><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for(let i=0; i<rowsCount; i++) {
    html += '<tr>' + cols.map(() => `<td><div class="skeleton skeleton-text"></div></td>`).join('') + '</tr>';
  }
  return html + '</tbody></table>';
}

// ===== GLOBAL CHAT WIDGET =====
let globalChatHistory = [];
let chatOpen = false;

function toggleGlobalChat() {
  const modal = document.getElementById('global-chat-modal');
  const btn   = document.getElementById('floating-chat-btn');
  if (!modal) return;
  chatOpen = !chatOpen;
  if (chatOpen) {
    modal.classList.add('open');
    btn.innerHTML = '✖';
    setTimeout(() => document.getElementById('global-user-input').focus(), 100);
  } else {
    modal.classList.remove('open');
    btn.innerHTML = '💬';
  }
}

async function sendGlobalMessage() {
  const input   = document.getElementById('global-user-input');
  const question = input.value.trim();
  if (!question) return;

  input.value = '';
  const sendBtn = document.getElementById('global-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  appendGlobalMsg('user', question);
  const typingId = appendGlobalTyping();

  try {
    const res  = await fetch(API + '/api/chat', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({ question, history: globalChatHistory }),
    });
    const data = await res.json();
    removeGlobalTyping(typingId);

    const answer = data.answer || "Désolé, je n'ai pas pu répondre.";
    let extra = '';
    if (data.data && data.data.length > 0) {
      extra = `<div class="gchat-result-info">✅ ${data.count} résultat(s) — <a href="/assistant" style="color:inherit;text-decoration:underline;">Voir détails</a></div>`;
    }
    appendGlobalMsg('bot', answer, extra);

    globalChatHistory.push({role:'user',      content: question});
    globalChatHistory.push({role:'assistant', content: answer});
    if (globalChatHistory.length > 8) globalChatHistory = globalChatHistory.slice(-8);
  } catch (err) {
    removeGlobalTyping(typingId);
    appendGlobalMsg('bot', '❌ Erreur de connexion. Vérifiez que le serveur est démarré.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    document.getElementById('global-user-input').focus();
  }
}

function appendGlobalMsg(role, text, extra = '') {
  const box = document.getElementById('global-chat-box');
  if (!box) return;
  const div  = document.createElement('div');
  div.className = `gchat-msg ${role}`;
  const time = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  div.innerHTML = `<div class="gchat-bubble">${text}</div>${extra}<span class="gchat-time">${time}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function appendGlobalTyping() {
  const box = document.getElementById('global-chat-box');
  if (!box) return null;
  const id  = 'g-typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'gchat-msg bot';
  div.id = id;
  div.innerHTML = `<div class="gchat-bubble gchat-typing"><span></span><span></span><span></span></div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeGlobalTyping(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function initFloatingChat() {
  const html = `
  <div id="floating-chat-container">
    <!-- Fenêtre de chat -->
    <div id="global-chat-modal">
      <div class="gchat-header">
        <div class="gchat-header-info">
          <div class="gchat-avatar">🤖</div>
          <div>
            <div style="font-weight:700;font-size:0.95rem;">TranspoBot</div>
            <div style="font-size:0.75rem;opacity:0.85;">Assistant IA • En ligne</div>
          </div>
        </div>
        <button class="gchat-close-btn" onclick="toggleGlobalChat()" title="Fermer">✖</button>
      </div>
      <div class="gchat-body" id="global-chat-box">
        <div class="gchat-msg bot">
          <div class="gchat-bubble">👋 Bonjour ! Je suis <strong>TranspoBot</strong>.<br>Posez-moi une question sur la flotte, les trajets ou les incidents.</div>
        </div>
      </div>
      <div class="gchat-footer">
        <input
          type="text"
          id="global-user-input"
          placeholder="Écrire un message..."
          autocomplete="off"
          onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); sendGlobalMessage(); }"
        />
        <button id="global-send-btn" onclick="sendGlobalMessage()" title="Envoyer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
    </div>
    <!-- Bouton flottant -->
    <button id="floating-chat-btn" class="floating-chat-btn" onclick="toggleGlobalChat()" title="Ouvrir l'assistant IA">
      💬
    </button>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFloatingChat();
});
