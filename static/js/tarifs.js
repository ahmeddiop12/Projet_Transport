document.addEventListener('DOMContentLoaded', () => {
  const tableContainer = document.getElementById('tarifs-table');
  tableContainer.innerHTML = skeletonTable(['Ligne', 'Type de Client', 'Prix (FCFA)'], 6);

  fetch(`${API}/api/tarifs`)
    .then(res => res.json())
    .then(data => {
      if (data.length === 0) {
        tableContainer.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">Aucun tarif trouvé.</p>';
        return;
      }
      
      const thead = `<tr>
        <th>Code Ligne</th>
        <th>Nom Ligne</th>
        <th>Type de Client</th>
        <th>Prix</th>
      </tr>`;
      
      const tbody = data.map(t => `
        <tr class="animate-row">
          <td><strong>${escHtml(t.ligne_code)}</strong></td>
          <td>${escHtml(t.ligne_nom)}</td>
          <td><span class="badge badge-planifie" style="text-transform: capitalize;">${escHtml(t.type_client)}</span></td>
          <td style="font-weight: 700; color: var(--primary);">${fmtMoney(t.prix)}</td>
        </tr>
      `).join('');
      
      tableContainer.innerHTML = `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    })
    .catch(err => {
      console.error(err);
      tableContainer.innerHTML = `<p style="color:var(--danger);text-align:center;padding:2rem;">Erreur lors du chargement des tarifs.</p>`;
    });
});
