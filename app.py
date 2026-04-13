"""
TranspoBot — Backend FastAPI Complet
Projet GLSi L3 — ESP/UCAD — Licence 3
Assistant IA de gestion de transport urbain
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import mysql.connector
import os
import re
import json
import httpx
from datetime import datetime
from typing import Optional, List
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent / ".env")
app = FastAPI(
    title="TranspoBot API",
    version="2.0.0",
    description="API REST pour la gestion de transport urbain avec assistant IA"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Configuration ──────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "3306")),
    "user":     os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME",     "transpobot"),
    "charset":  "utf8mb4",
}

LLM_API_KEY  = os.getenv("OPENAI_API_KEY", "")
LLM_MODEL    = os.getenv("LLM_MODEL",      "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL",   "https://api.openai.com/v1")

# ── Schéma de la base (contexte pour le LLM) ──────────────────
DB_SCHEMA = """
Tables MySQL disponibles dans la base `transpobot` :

vehicules(id, immatriculation, type[bus/minibus/taxi], capacite, statut[actif/maintenance/hors_service], kilometrage, date_acquisition, marque, modele)

chauffeurs(id, nom, prenom, telephone, numero_permis, categorie_permis, disponibilite, vehicule_id, date_embauche, salaire_base)
  → vehicule_id référence vehicules(id)

lignes(id, code, nom, origine, destination, distance_km, duree_minutes, actif)

tarifs(id, ligne_id, type_client[normal/etudiant/senior], prix)
  → ligne_id référence lignes(id)

trajets(id, ligne_id, chauffeur_id, vehicule_id, date_heure_depart, date_heure_arrivee, statut[planifie/en_cours/termine/annule], nb_passagers, recette, observations)
  → ligne_id → lignes(id), chauffeur_id → chauffeurs(id), vehicule_id → vehicules(id)

incidents(id, trajet_id, type[panne/accident/retard/autre], description, gravite[faible/moyen/grave], date_incident, resolu, cout_reparation)
  → trajet_id → trajets(id)

maintenance(id, vehicule_id, type_operation, date_debut, date_fin, cout, description, statut[en_cours/termine])
  → vehicule_id → vehicules(id)
"""

# ── Prompt système — ingénierie de prompt ──────────────────────
SYSTEM_PROMPT = f"""Tu es TranspoBot, l'assistant intelligent de la compagnie de transport sénégalaise.
Tu aides les gestionnaires à interroger la base de données MySQL en langage naturel.

{DB_SCHEMA}

RÈGLES STRICTES :
1. Génère UNIQUEMENT des requêtes SELECT. Toute requête INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER est INTERDITE.
2. Réponds TOUJOURS en JSON valide avec ce format exact :
   {{"sql": "SELECT ...", "explication": "Réponse claire en français"}}
3. Si la question ne peut pas être répondue par SQL, réponds :
   {{"sql": null, "explication": "Explication claire de pourquoi"}}
4. Utilise des alias lisibles (ex: c.nom AS chauffeur, COUNT(*) AS nb_trajets).
5. Limite à 100 lignes avec LIMIT 100 sauf si le contexte demande moins.
6. Pour les questions sur "cette semaine" utilise DATE_SUB(NOW(), INTERVAL 7 DAY).
7. Pour les questions sur "ce mois" utilise MONTH(NOW()) et YEAR(NOW()).
8. Joins : utilise toujours des alias de table courts (t pour trajets, c pour chauffeurs, v pour vehicules, l pour lignes, i pour incidents).
9. Formate les montants en FCFA, les distances en km, les durées en minutes.
10. L'explication doit être une réponse directe à la question posée, pas une description de la requête.

EXEMPLES :
Question : "Combien de trajets cette semaine ?"
Réponse : {{"sql": "SELECT COUNT(*) AS nb_trajets FROM trajets t WHERE t.date_heure_depart >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND t.statut = 'termine'", "explication": "Il y a X trajets terminés cette semaine."}}

Question : "Quel chauffeur a le plus d'incidents ce mois ?"
Réponse : {{"sql": "SELECT c.nom, c.prenom, COUNT(i.id) AS nb_incidents FROM incidents i JOIN trajets t ON i.trajet_id = t.id JOIN chauffeurs c ON t.chauffeur_id = c.id WHERE MONTH(i.date_incident) = MONTH(NOW()) AND YEAR(i.date_incident) = YEAR(NOW()) GROUP BY c.id, c.nom, c.prenom ORDER BY nb_incidents DESC LIMIT 1", "explication": "Le chauffeur avec le plus d'incidents ce mois est..."}}
"""

# ── Connexion MySQL ────────────────────────────────────────────
def get_db():
    return mysql.connector.connect(**DB_CONFIG)

def execute_query(sql: str) -> list:
    """Exécute une requête SELECT et retourne les résultats."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql)
        rows = cursor.fetchall()
        # Convertir les types non-sérialisables
        result = []
        for row in rows:
            clean = {}
            for k, v in row.items():
                if isinstance(v, (datetime,)):
                    clean[k] = v.isoformat()
                elif hasattr(v, '__float__'):
                    clean[k] = float(v)
                else:
                    clean[k] = v
            result.append(clean)
        return result
    finally:
        cursor.close()
        conn.close()

def is_safe_query(sql: str) -> bool:
    """Vérifie que la requête SQL est en lecture seule."""
    forbidden = r'\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXEC)\b'
    return not re.search(forbidden, sql.upper())

# ── Appel LLM ─────────────────────────────────────────────────
async def ask_llm(question: str, history: list = None) -> dict:
    """Appelle le LLM pour convertir une question en SQL."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    if history:
        for msg in history[-6:]:
            messages.append(msg)
    
    messages.append({"role": "user", "content": question})
    
    print(f"DEBUG - API KEY: '{LLM_API_KEY[:10]}...'")
    print(f"DEBUG - MODEL: '{LLM_MODEL}'")
    print(f"DEBUG - URL: '{LLM_BASE_URL}'")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{LLM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json={
                    "model": LLM_MODEL,
                    "messages": messages,
                    "temperature": 0,
                    "max_tokens": 500,
                },
                timeout=30,
            )
            print(f"DEBUG - STATUS: {response.status_code}")
            print(f"DEBUG - RESPONSE: {response.text[:300]}")
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            match = re.search(r'\{.*\}', content, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise ValueError(f"Réponse LLM non JSON : {content[:200]}")
        except Exception as e:
            print(f"DEBUG - ERREUR: {str(e)}")
            raise
# ── Modèles Pydantic ───────────────────────────────────────────
class ChatMessage(BaseModel):
    question: str
    history: Optional[list] = []

class VehiculeUpdate(BaseModel):
    statut: str

# ── Routes API ─────────────────────────────────────────────────



@app.post("/api/chat")
async def chat(msg: ChatMessage):
    """
    Point d'entrée principal : question en langage naturel → SQL → résultats.
    Sécurité : uniquement des requêtes SELECT autorisées.
    """
    try:
        llm_response = await ask_llm(msg.question, msg.history)
        sql         = llm_response.get("sql")
        explication = llm_response.get("explication", "")

        # Pas de SQL nécessaire
        if not sql:
            return {
                "answer":  explication,
                "data":    [],
                "sql":     None,
                "count":   0,
            }

        # Vérification de sécurité
        if not is_safe_query(sql):
            return {
                "answer": "⚠️ Requête refusée : seules les lectures (SELECT) sont autorisées.",
                "data":   [],
                "sql":    sql,
                "count":  0,
            }

        data = execute_query(sql)
        return {
            "answer":  explication,
            "data":    data,
            "sql":     sql,
            "count":   len(data),
        }
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Erreur LLM : {str(e)}")
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"Erreur BDD : {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
def get_stats():
    """Tableau de bord — KPIs principaux."""
    queries = {
        "total_trajets":     "SELECT COUNT(*) AS n FROM trajets WHERE statut='termine'",
        "trajets_en_cours":  "SELECT COUNT(*) AS n FROM trajets WHERE statut='en_cours'",
        "trajets_planifies": "SELECT COUNT(*) AS n FROM trajets WHERE statut='planifie'",
        "vehicules_actifs":  "SELECT COUNT(*) AS n FROM vehicules WHERE statut='actif'",
        "vehicules_maintenance": "SELECT COUNT(*) AS n FROM vehicules WHERE statut='maintenance'",
        "chauffeurs_dispo":  "SELECT COUNT(*) AS n FROM chauffeurs WHERE disponibilite=TRUE",
        "incidents_ouverts": "SELECT COUNT(*) AS n FROM incidents WHERE resolu=FALSE",
        "recette_totale":    "SELECT COALESCE(SUM(recette), 0) AS n FROM trajets WHERE statut='termine'",
        "recette_semaine":   "SELECT COALESCE(SUM(recette), 0) AS n FROM trajets WHERE statut='termine' AND date_heure_depart >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
        "passagers_mois":    "SELECT COALESCE(SUM(nb_passagers), 0) AS n FROM trajets WHERE statut='termine' AND MONTH(date_heure_depart)=MONTH(NOW()) AND YEAR(date_heure_depart)=YEAR(NOW())",
    }
    stats = {}
    for key, sql in queries.items():
        result = execute_query(sql)
        stats[key] = result[0]["n"] if result else 0
    return stats

@app.get("/api/vehicules")
def get_vehicules(statut: Optional[str] = None):
    """Liste des véhicules, filtrée par statut si précisé."""
    where = f"WHERE statut='{statut}'" if statut else ""
    return execute_query(f"SELECT * FROM vehicules {where} ORDER BY immatriculation")

@app.get("/api/vehicules/{vehicule_id}")
def get_vehicule(vehicule_id: int):
    result = execute_query(f"SELECT * FROM vehicules WHERE id={vehicule_id}")
    if not result:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    return result[0]

@app.get("/api/chauffeurs")
def get_chauffeurs(disponible: Optional[bool] = None):
    """Liste des chauffeurs avec leur véhicule associé."""
    where = ""
    if disponible is not None:
        where = f"WHERE c.disponibilite={'TRUE' if disponible else 'FALSE'}"
    return execute_query(f"""
        SELECT c.id, c.nom, c.prenom, c.telephone, c.numero_permis,
               c.categorie_permis, c.disponibilite, c.date_embauche,
               v.immatriculation AS vehicule, v.type AS type_vehicule
        FROM chauffeurs c
        LEFT JOIN vehicules v ON c.vehicule_id = v.id
        {where}
        ORDER BY c.nom, c.prenom
    """)

@app.get("/api/lignes")
def get_lignes():
    """Liste de toutes les lignes avec leurs tarifs moyens."""
    return execute_query("""
        SELECT l.*, 
               COALESCE(AVG(ta.prix), 0) AS tarif_moyen
        FROM lignes l
        LEFT JOIN tarifs ta ON l.id = ta.ligne_id
        WHERE l.actif = TRUE
        GROUP BY l.id
        ORDER BY l.code
    """)

@app.get("/api/trajets/recent")
def get_trajets_recent(limit: int = 20):
    """Trajets récents avec toutes les informations jointes."""
    return execute_query(f"""
        SELECT t.id, t.date_heure_depart, t.date_heure_arrivee,
               t.statut, t.nb_passagers, t.recette,
               l.code AS ligne_code, l.nom AS ligne_nom,
               l.origine, l.destination,
               CONCAT(c.prenom, ' ', c.nom) AS chauffeur,
               v.immatriculation, v.type AS type_vehicule
        FROM trajets t
        JOIN lignes l    ON t.ligne_id     = l.id
        JOIN chauffeurs c ON t.chauffeur_id = c.id
        JOIN vehicules v  ON t.vehicule_id  = v.id
        ORDER BY t.date_heure_depart DESC
        LIMIT {min(limit, 100)}
    """)

@app.get("/api/incidents")
def get_incidents(resolu: Optional[bool] = None, gravite: Optional[str] = None):
    """Liste des incidents avec filtres optionnels."""
    conditions = []
    if resolu is not None:
        conditions.append(f"i.resolu={'TRUE' if resolu else 'FALSE'}")
    if gravite:
        conditions.append(f"i.gravite='{gravite}'")
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return execute_query(f"""
        SELECT i.id, i.type, i.description, i.gravite,
               i.date_incident, i.resolu, i.cout_reparation,
               t.date_heure_depart,
               l.nom AS ligne,
               CONCAT(c.prenom, ' ', c.nom) AS chauffeur,
               v.immatriculation
        FROM incidents i
        JOIN trajets t     ON i.trajet_id    = t.id
        JOIN lignes l      ON t.ligne_id     = l.id
        JOIN chauffeurs c  ON t.chauffeur_id = c.id
        JOIN vehicules v   ON t.vehicule_id  = v.id
        {where}
        ORDER BY i.date_incident DESC
        LIMIT 50
    """)

@app.get("/api/maintenance")
def get_maintenance():
    """Opérations de maintenance en cours et récentes."""
    return execute_query("""
        SELECT m.*, v.immatriculation, v.type AS type_vehicule, v.marque
        FROM maintenance m
        JOIN vehicules v ON m.vehicule_id = v.id
        ORDER BY m.date_debut DESC
    """)

@app.get("/api/stats/chauffeurs")
def get_stats_chauffeurs():
    """Statistiques par chauffeur : trajets, recettes, incidents."""
    return execute_query("""
        SELECT c.id,
               CONCAT(c.prenom, ' ', c.nom) AS chauffeur,
               COUNT(DISTINCT t.id) AS nb_trajets,
               COALESCE(SUM(t.recette), 0) AS recette_totale,
               COALESCE(SUM(t.nb_passagers), 0) AS passagers_total,
               COUNT(DISTINCT i.id) AS nb_incidents
        FROM chauffeurs c
        LEFT JOIN trajets   t ON c.id = t.chauffeur_id AND t.statut = 'termine'
        LEFT JOIN incidents i ON t.id = i.trajet_id
        GROUP BY c.id, c.nom, c.prenom
        ORDER BY nb_trajets DESC
    """)

@app.get("/api/stats/lignes")
def get_stats_lignes():
    """Statistiques par ligne : trajets, recettes, taux de remplissage."""
    return execute_query("""
        SELECT l.code, l.nom, l.origine, l.destination,
               COUNT(t.id) AS nb_trajets,
               COALESCE(SUM(t.recette), 0) AS recette_totale,
               COALESCE(AVG(t.nb_passagers), 0) AS moy_passagers,
               COALESCE(AVG(t.nb_passagers / v.capacite * 100), 0) AS taux_remplissage
        FROM lignes l
        LEFT JOIN trajets   t ON l.id = t.ligne_id AND t.statut = 'termine'
        LEFT JOIN vehicules v ON t.vehicule_id = v.id
        GROUP BY l.id, l.code, l.nom, l.origine, l.destination
        ORDER BY nb_trajets DESC
    """)

@app.get("/health")
def health():
    """Vérification de santé de l'API."""
    try:
        result = execute_query("SELECT 1 AS ok")
        db_ok = result[0]["ok"] == 1
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "app":    "TranspoBot v2.0",
        "db":     "connected" if db_ok else "error",
        "time":   datetime.now().isoformat(),
    }

# ── Frontend Statique ──────────────────────────────────────────
# ── Frontend Statique ──────────────────────────────────────────
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/")
def root():
    return FileResponse(Path(__file__).parent / "static" / "index.html")

@app.get("/assistant")
def page_assistant():
    return FileResponse(Path(__file__).parent / "static" / "assistant.html")

@app.get("/vehicules-page")
def page_vehicules():
    return FileResponse(Path(__file__).parent / "static" / "vehicules.html")

@app.get("/chauffeurs-page")
def page_chauffeurs():
    return FileResponse(Path(__file__).parent / "static" / "chauffeurs.html")

@app.get("/incidents-page")
def page_incidents():
    return FileResponse(Path(__file__).parent / "static" / "incidents.html")
# ── Lancement ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
