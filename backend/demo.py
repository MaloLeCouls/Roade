"""G.2 — Projet de démonstration embarqué.

Un clic depuis l'écran d'accueil (« Ouvrir l'exemple ») crée un vrai projet sur
disque, y dépose un CSV FR de test et un workflow complet **et exécutable** :

    Source → Nettoyage → Calcul → Validation → 2 Exports (conformes / à corriger)

But : faire passer un primo-utilisateur de « Aucun projet » à un premier export
en un clic (P9, anti-slop #3), et montrer d'emblée ce qui distingue Roade d'un
SaaS générique — la lecture *correcte* d'un CSV FR (séparateur `;`, décimale
virgule, accents : chantier A), le nettoyage tracé, une colonne calculée, et le
routage Conformes / Non conformes de la Validation.

Le CSV est volontairement « piégeux mais réaliste » : décimales `12,50`
(SUM casserait en silence sans A.2), espaces parasites dans `Client`
(→ Nettoyage), accents (→ encodage), et des références hors nomenclature
`CMD-…` (→ la Validation les sépare). C'est l'investissement anti-slop n°2 :
les chiffres sont justes.
"""

from __future__ import annotations

import uuid

import storage

DEMO_PROJECT_NAME = "Démo — Commandes 2024"
DEMO_WORKFLOW_NAME = "Traitement des commandes"
DEMO_CSV_FILE = "commandes.csv"

# Écrit tel quel dans le projet (UTF-8). Séparateur `;`, décimale `,`, dates
# JJ/MM/AAAA — exactement ce que produit un export Excel FR.
DEMO_CSV = """Référence;Client;Quantité;Prix unitaire;Date
CMD-1001; Durand SARL ;3;12,50;15/01/2024
CMD-1002;Martin & Fils;10;7,30;18/01/2024
CMD-1003; Léa Boucherie;5;24,90;02/02/2024
REF-9001;Dupont Métaux;2;5,00;10/02/2024
CMD-1004;Garage Moreau ;1;199,99;21/02/2024
CMD-1005;Épicerie Côté Sud;8;3,25;05/03/2024
X-0007;Atelier inconnu;4;15,00;12/03/2024
CMD-1006;Boulangerie Müller;6;1,95;19/03/2024
CMD-1007; Pharmacie Nguyễn ;2;42,00;28/03/2024
1008;Quincaillerie Béton;7;9,90;03/04/2024
CMD-1009;Café de la Gare;12;2,40;15/04/2024
CMD-1010;Fromagerie Hervé;3;18,75;22/04/2024
"""


def _edge(eid: str, source: str, target: str, sh: str = "out", th: str = "in") -> dict:
    return {
        "id": eid,
        "source": source,
        "target": target,
        "sourceHandle": sh,
        "targetHandle": th,
    }


def build_demo_workflow(wid: str) -> dict:
    """Le graphe de démo, prêt à exécuter contre `commandes.csv`."""
    nodes = [
        {
            "id": "src",
            "type": "source",
            "position": {"x": 0, "y": 60},
            "data": {
                "label": "Commandes 2024",
                "file": DEMO_CSV_FILE,
                "sheet": "",
                "header_row": 0,
                "cache": True,
                # A.1/A.2 : encodage auto-sniffé, décimale virgule explicite
                # (un export Excel FR), et la date typée dès la source (A.6).
                "encoding": "auto",
                "decimal": ",",
                "thousands": "",
                "casts": [{"column": "Date", "type": "date"}],
            },
        },
        {
            "id": "clean",
            "type": "clean",
            "position": {"x": 280, "y": 60},
            "data": {
                "label": "Nettoyage",
                "operations": [
                    {"id": "o1", "op": "trim", "column": "Client", "enabled": True},
                ],
            },
        },
        {
            "id": "calc",
            "type": "calc",
            "position": {"x": 560, "y": 60},
            "data": {
                "label": "Montant",
                "columns": [
                    {
                        "id": "k1",
                        "name": "Montant",
                        "expr": "[Quantité] * [Prix unitaire]",
                        "enabled": True,
                    },
                ],
            },
        },
        {
            "id": "val",
            "type": "validate",
            "position": {"x": 840, "y": 60},
            "data": {
                "label": "Référence conforme",
                "mode": "route",
                "intent": "control",
                "target_column": "Référence",
                "case_sensitive": False,
                "routing": "first",
                "conditions": [
                    {
                        "id": "c1",
                        "name": "Conforme",
                        "kind": "rules",
                        "column": "Référence",
                        "groups": [{"rules": [{"test": "starts_with", "value": "CMD-"}]}],
                        "segments": [],
                        "test_samples": "",
                    }
                ],
                "outputs": [
                    {
                        "id": "valid",
                        "label": "Conformes",
                        "color": "#59A14F",
                        "match": {"conditionId": "c1", "negate": False},
                    },
                    {
                        "id": "invalid",
                        "label": "Non conformes",
                        "color": "#E15759",
                        "match": {"conditionId": "c1", "negate": True},
                    },
                ],
                "else_enabled": False,
                "else_label": "Non classé",
                "else_color": "#9aa3b2",
                "add_flag": False,
                "test_samples": "",
            },
        },
        {
            "id": "exp_ok",
            "type": "export",
            "position": {"x": 1140, "y": -30},
            "data": {
                "label": "Commandes conformes",
                "filename": "Commandes conformes",
                "format": "xlsx",
                "auto_name": False,
                "enabled": True,
                "to_workbook": False,
            },
        },
        {
            "id": "exp_ko",
            "type": "export",
            "position": {"x": 1140, "y": 150},
            "data": {
                "label": "À corriger",
                "filename": "À corriger",
                "format": "csv",
                "auto_name": False,
                "enabled": True,
                "to_workbook": False,
                # Preset Excel FR (A.4) : `;` + décimale `,` + BOM UTF-8.
                "csv": {"sep": ";", "decimal": ",", "bom": True},
            },
        },
    ]
    edges = [
        _edge("e1", "src", "clean"),
        _edge("e2", "clean", "calc"),
        _edge("e3", "calc", "val"),
        _edge("e4", "val", "exp_ok", sh="valid"),
        _edge("e5", "val", "exp_ko", sh="invalid"),
    ]
    return {"id": wid, "name": DEMO_WORKFLOW_NAME, "nodes": nodes, "edges": edges}


def seed_demo_project() -> dict:
    """Crée le projet de démo (dossier + CSV + workflow) et renvoie de quoi
    naviguer droit dessus : `{project_id, workflow_id, name}`.

    Idempotence : on ne déduplique pas — `storage.create_project` suffixe le
    dossier (`…-2`) en cas de re-création. En pratique le bouton n'apparaît
    qu'à l'état vide (aucun projet), donc on ne peut pas le cliquer deux fois
    de suite sans repasser par une liste vide.
    """
    proj = storage.create_project(DEMO_PROJECT_NAME)
    pid = proj["id"]
    (storage.files_dir(pid) / DEMO_CSV_FILE).write_text(DEMO_CSV, encoding="utf-8")
    wid = uuid.uuid4().hex[:8]
    storage.save_workflow(pid, build_demo_workflow(wid))
    return {"project_id": pid, "workflow_id": wid, "name": DEMO_PROJECT_NAME}
