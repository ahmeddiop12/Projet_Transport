"""
TranspoBot — Backend FastAPI Complet
Projet GLSi L3 — ESP/UCAD — Licence 3
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import mysql.connector
import os, re, json, httpx
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

app = FastAPI(title="TranspoBot API", version="2.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "3306")),
    "user":     os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME",     "transpobot"),
    "charset":  "utf8mb4",
}

LLM_API_KEY  = os.getenv("OPENAI_API_KEY", "")
LLM_MODEL    = os.getenv("LLM_MODEL",      "llama-3.3-70b-versatile")
LLM_BASE_URL = os.getenv("LLM_BASE_URL",   "https://api.groq.com/openai/v1")

DB_SCHEMA = """
vehicules(id, immatriculation, type[bus/minibus/taxi], capacite, statut[actif/maintenance/hors_service], kilometrage, date_acquisition, marque, modele)
chauffeurs(id, nom, prenom, telephone, numero_permis, categorie_permis, disponibilite, vehicule_id, date_embauche, salaire_base)
lignes(id, code, nom, origine, destination, distance_km, duree_minutes, actif)
tarifs(id, ligne_id, type_client[normal/etudiant/senior], prix)
trajets(id, ligne_id, chauffeur_id, vehicule_id, date_heure_depart, date_heure_arrivee, statut[planifie/en_cours/termine/annule], nb_passagers, recette)
incidents(id, trajet_id, type[panne/accident/retard/autre], description, gravite[faible/moyen/grave], date_incident, resolu, cout_reparation)
maintenance(id, vehicule_id, type_operation, date_debut, date_fin, cout, description, statut[en_cours/termine])
"""

SYSTEM_PROMPT = f"""Tu es TranspoBot, assistant intelligent de transport sénégalais.
{DB_SCHEMA}
REGLES: 1.SELECT uniquement. 2.JSON: {{"sql":"...","explication":"..."}}. 3.LIMIT 100. 4.Cette semaine=DATE_SUB(NOW(),INTERVAL 7 DAY). 5.Ce mois=MONTH(NOW()) AND YEAR(NOW()).
"""

def get_db():
    return mysql.connector.connect(**DB_CONFIG)

def execute_query(sql: str) -> list:
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql)
        rows = cursor.fetchall()
        result = []
        for row in rows:
            clean = {}
            for k, v in row.items():
                if isinstance(v, datetime): clean[k] = v.isoformat()
                elif hasattr(v, '__float__'): clean[k] = float(v)
                else: clean[k] = v
            result.append(clean)
        return result
    finally:
        cursor.close()
        conn.close()

def is_safe_query(sql: str) -> bool:
    return not re.search(r'\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXEC)\b', sql.upper())

async def ask_llm(question: str, history: list = None) -> dict:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history:
        for msg in history[-6:]: messages.append(msg)
    messages.append({"role": "user", "content": question})
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json={"model": LLM_MODEL, "messages": messages, "temperature": 0, "max_tokens": 500},
            timeout=30,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match: return json.loads(match.group())
        raise ValueError(f"Réponse LLM invalide")

class ChatMessage(BaseModel):
    question: str
    history: Optional[list] = []

# ── Pages HTML ─────────────────────────────────────────────────
@app.get("/")
def root():
    return FileResponse(Path(__file__).parent / "static" / "index.html")

@app.get("/assistant")
def page_assistant():
    return FileResponse(Path(__file__).parent / "static" / "chat.html")

@app.get("/vehicules-page")
def page_vehicules():
    return FileResponse(Path(__file__).parent / "static" / "vehicules.html")

@app.get("/chauffeurs-page")
def page_chauffeurs():
    return FileResponse(Path(__file__).parent / "static" / "chauffeurs.html")

@app.get("/incidents-page")
def page_incidents():
    return FileResponse(Path(__file__).parent / "static" / "incidents.html")

# ── API ────────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(msg: ChatMessage):
    try:
        llm_response = await ask_llm(msg.question, msg.history)
        sql = llm_response.get("sql")
        explication = llm_response.get("explication", "")
        if not sql:
            return {"answer": explication, "data": [], "sql": None, "count": 0}
        if not is_safe_query(sql):
            return {"answer": "Requete refusee : SELECT uniquement.", "data": [], "sql": sql, "count": 0}
        data = execute_query(sql)
        return {"answer": explication, "data": data, "sql": sql, "count": len(data)}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Erreur LLM : {str(e)}")
    except mysql.connector.Error as e:
        raise HTTPException(status_code=500, detail=f"Erreur BDD : {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
def get_stats():
    queries = {
        "total_trajets":         "SELECT COUNT(*) AS n FROM trajets WHERE statut='termine'",
        "trajets_en_cours":      "SELECT COUNT(*) AS n FROM trajets WHERE statut='en_cours'",
        "trajets_planifies":     "SELECT COUNT(*) AS n FROM trajets WHERE statut='planifie'",
        "vehicules_actifs":      "SELECT COUNT(*) AS n FROM vehicules WHERE statut='actif'",
        "vehicules_maintenance": "SELECT COUNT(*) AS n FROM vehicules WHERE statut='maintenance'",
        "chauffeurs_dispo":      "SELECT COUNT(*) AS n FROM chauffeurs WHERE disponibilite=TRUE",
        "incidents_ouverts":     "SELECT COUNT(*) AS n FROM incidents WHERE resolu=FALSE",
        "recette_totale":        "SELECT COALESCE(SUM(recette),0) AS n FROM trajets WHERE statut='termine'",
        "recette_semaine":       "SELECT COALESCE(SUM(recette),0) AS n FROM trajets WHERE statut='termine' AND date_heure_depart>=DATE_SUB(NOW(),INTERVAL 7 DAY)",
        "passagers_mois":        "SELECT COALESCE(SUM(nb_passagers),0) AS n FROM trajets WHERE statut='termine' AND MONTH(date_heure_depart)=MONTH(NOW()) AND YEAR(date_heure_depart)=YEAR(NOW())",
    }
    stats = {}
    for key, sql in queries.items():
        try:
            result = execute_query(sql)
            stats[key] = result[0]["n"] if result else 0
        except Exception:
            stats[key] = 0
    return stats

@app.get("/api/vehicules")
def get_vehicules(statut: Optional[str] = None):
    where = f"WHERE statut='{statut}'" if statut else ""
    return execute_query(f"SELECT * FROM vehicules {where} ORDER BY immatriculation")

@app.get("/api/chauffeurs")
def get_chauffeurs():
    return execute_query("""
        SELECT c.id, c.nom, c.prenom, c.telephone, c.numero_permis,
               c.categorie_permis, c.disponibilite, c.date_embauche,
               v.immatriculation AS vehicule, v.type AS type_vehicule
        FROM chauffeurs c LEFT JOIN vehicules v ON c.vehicule_id = v.id
        ORDER BY c.nom, c.prenom
    """)

@app.get("/api/trajets/recent")
def get_trajets_recent(limit: int = 20):
    return execute_query(f"""
        SELECT t.id, t.date_heure_depart, t.date_heure_arrivee,
               t.statut, t.nb_passagers, t.recette,
               l.code AS ligne_code, l.nom AS ligne_nom, l.origine, l.destination,
               CONCAT(c.prenom,' ',c.nom) AS chauffeur,
               v.immatriculation, v.type AS type_vehicule
        FROM trajets t
        JOIN lignes l ON t.ligne_id=l.id
        JOIN chauffeurs c ON t.chauffeur_id=c.id
        JOIN vehicules v ON t.vehicule_id=v.id
        ORDER BY t.date_heure_depart DESC LIMIT {min(limit,100)}
    """)

@app.get("/api/incidents")
def get_incidents(resolu: Optional[bool] = None, gravite: Optional[str] = None):
    conditions = []
    if resolu is not None: conditions.append(f"i.resolu={'TRUE' if resolu else 'FALSE'}")
    if gravite: conditions.append(f"i.gravite='{gravite}'")
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return execute_query(f"""
        SELECT i.id, i.type, i.description, i.gravite,
               i.date_incident, i.resolu, i.cout_reparation,
               l.nom AS ligne, CONCAT(c.prenom,' ',c.nom) AS chauffeur, v.immatriculation
        FROM incidents i
        JOIN trajets t ON i.trajet_id=t.id
        JOIN lignes l ON t.ligne_id=l.id
        JOIN chauffeurs c ON t.chauffeur_id=c.id
        JOIN vehicules v ON t.vehicule_id=v.id
        {where} ORDER BY i.date_incident DESC LIMIT 50
    """)

@app.get("/api/maintenance")
def get_maintenance():
    return execute_query("""
        SELECT m.*, v.immatriculation, v.type AS type_vehicule, v.marque
        FROM maintenance m JOIN vehicules v ON m.vehicule_id=v.id
        ORDER BY m.date_debut DESC
    """)

@app.get("/health")
def health():
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

# ── Fichiers statiques ─────────────────────────────────────────
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
