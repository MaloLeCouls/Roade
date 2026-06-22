"""Enveloppe d'erreur typée pour l'API Roade (todo B.6).

Avant B.6, l'API répondait `{"detail": "..."}` (forme FastAPI par défaut) et,
sur 8 routes, un `HTTPException(400, str(e))` fourre-tout : le front ne recevait
qu'un message FR libre, impossible à interpréter par programme.

Désormais **toute** erreur de l'API est rendue sous une forme stable :

    {"code": "<domaine.raison>", "message": "<texte FR>", "details": <option>}

- ``code`` est **machine-lisible et stable** : le front peut s'y fier pour
  réagir (router vers une vue, rejouer, distinguer « introuvable » d'« invalide »)
  sans parser le message.
- ``message`` reste le texte FR affichable tel quel.
- ``details`` n'est présent que pour les 422 de validation (liste des champs
  fautifs renvoyée par Pydantic).

Vocabulaire des codes (convention ``domaine.raison``) :

    project.not_found · workflow.not_found · file.not_found · backpack.not_found
    project.name_required · backpack.empty_selection
    file.invalid_name · file.invalid_path · file.not_openable · file.open_failed
    source.peek_failed · run.failed · preview.failed · profile.failed
    group.failed · route_preview.failed · split_scan.failed · filter_preview.failed
    document.failed
    bad_request · not_found · validation_error · internal_error   (repli par statut)
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class RoadeError(Exception):
    """Erreur applicative *typée*.

    Levée partout où l'on veut un code stable plutôt qu'un `HTTPException` nu.
    Rendue en `{code, message}` par le handler enregistré ci-dessous.
    """

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


# Repli lorsqu'une `HTTPException` nue traverse l'API sans code applicatif
# (ex. le 404 du catch-all SPA, ou un 404 de routeur Starlette).
_STATUS_DEFAULT_CODE = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    500: "internal_error",
}


def _envelope(code: str, message: str, details: object | None = None) -> dict:
    body: dict = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return body


def register_error_handlers(app: FastAPI) -> None:
    """Branche les 3 handlers qui garantissent l'enveloppe `{code, message}`."""

    @app.exception_handler(RoadeError)
    async def _handle_roade(_request: Request, exc: RoadeError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(exc.code, exc.message),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Couvre aussi `fastapi.HTTPException` (sous-classe) : Starlette résout le
        # handler en remontant la MRO. `detail` est déjà un message FR chez nous.
        code = _STATUS_DEFAULT_CODE.get(exc.status_code, "error")
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code, message),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # B.5 : un body malformé est arrêté par Pydantic AVANT l'engine. On garde
        # le détail par champ (utile au front) mais sous notre enveloppe + code.
        return JSONResponse(
            status_code=422,
            content=_envelope(
                "validation_error",
                "Requête invalide.",
                details=jsonable_encoder(exc.errors()),
            ),
        )
