document.addEventListener('DOMContentLoaded', () => {
  const tableContainer = document.getElementById('lignes-table');
  tableContainer.innerHTML = skeletonTable(['ID', 'Code', 'Nom', 'Origine', 'Destination', 'Distance (km)', 'Durée (min)', 'Actif'], 6);

  fetch(`${API}/api/lignes`)
    .then(res => res.json())
    .then(data => {
      if (data.length === 0) {
        tableContainer.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">Aucune ligne trouvée.</p>';
        return;
      }
      
      const thead = `<tr>
        <th>Code</th>
        <th>Nom</th>
        <th>Itinéraire</th>
        <th>Distance</th>
        <th>Durée</th>
        <th>Statut</th>
      </tr>`;
      
      const tbody = data.map(l => `
        <tr class="animate-row">
          <td><strong>${escHtml(l.code)}</strong></td>
          <td>${escHtml(l.nom)}</td>
          <td>${escHtml(l.origine)} ➔ ${escHtml(l.destination)}</td>
          <td>${l.distance_km} km</td>
          <td>${l.duree_minutes} min</td>
          <td>${l.actif ? badge('actif') : badge('hors_service')}</td>
        </tr>
      `).join('');
      
      tableContainer.innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    })
    .catch(err => {
      console.error(err);
      tableContainer.innerHTML = `<p style="color:var(--danger);text-align:center;padding:2rem;">Erreur lors du chargement des lignes.</p>`;
    });
});
