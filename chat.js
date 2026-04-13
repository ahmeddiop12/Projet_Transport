// ===== CHAT =====
let chatHistory = [];

async function ask(question) {
  document.getElementById('user-input').value = question;
  await sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const question = input.value.trim();
  if (!question) return;

  input.value = '';
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  // Message utilisateur
  appendMsg('user', question);

  // Indicateur de frappe
  const typingId = appendTyping();

  // Appel API
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ question, history: chatHistory }),
    });
    const data = await res.json();

    removeTyping(typingId);

    const answer = data.answer || 'Désolé, je n\'ai pas pu répondre.';
    const sqlCode = data.sql ? `<div class="sql-preview">🔍 SQL : ${escHtml(data.sql)}</div>` : '';
    const countInfo = data.count > 0 ? `<small style="color:var(--muted)"> — ${data.count} résultat(s)</small>` : '';

    appendMsg('bot', answer + countInfo, sqlCode);

    // Afficher les résultats
    if (data.data && data.data.length > 0) {
      document.getElementById('results-panel').innerHTML = `
        <div class="results-count">${data.count} résultat(s) — ${question}</div>
        <div class="table-wrap">${tableHTML(data.data)}</div>`;
    } else if (data.sql) {
      document.getElementById('results-panel').innerHTML = `
        <p style="color:var(--muted);text-align:center;padding:1rem">Aucun résultat pour cette requête.</p>`;
    }

    // Historique
    chatHistory.push({role:'user', content: question});
    chatHistory.push({role:'assistant', content: answer});
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

  } catch (err) {
    removeTyping(typingId);
    appendMsg('bot', '❌ Erreur de connexion. Vérifiez que le serveur est démarré.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function appendMsg(role, text, extra = '') {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const time = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  div.innerHTML = `<div class="bubble">${text}</div>${extra}<span class="msg-time">${time}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function appendTyping() {
  const box = document.getElementById('chat-box');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.id = id;
  div.innerHTML = `<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
