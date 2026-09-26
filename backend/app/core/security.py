from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer = HTTPBearer(auto_error=False)


@lru_cache(maxsize=4)
def jwks_client(domain: str):
    return jwt.PyJWKClient(
        f"https://{domain}/.well-known/jwks.json", cache_jwk_set=True, lifespan=300, timeout=10
    )


def current_subject(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "A valid access token is required", headers={"WWW-Authenticate": "Bearer"})
    if not settings.auth0_domain or not settings.auth0_audience:
        raise HTTPException(503, "Authentication is not configured. Use the browser's local mode.")
    try:
        key = jwks_client(settings.auth0_domain).get_signing_key_from_jwt(credentials.credentials).key
        claims = jwt.decode(
            credentials.credentials,
            key,
            algorithms=["RS256"],
            audience=settings.auth0_audience,
            issuer=f"https://{settings.auth0_domain}/",
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
        subject = claims["sub"]
        if not isinstance(subject, str) or not subject or len(subject) > 255:
            raise jwt.InvalidTokenError("Invalid subject")
        return subject
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503, "Identity provider is temporarily unavailable") from None
    except jwt.PyJWTError:
        raise HTTPException(
            401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}
        ) from None


def optional_subject(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str | None:
    if not credentials:
        return None
    return current_subject(credentials)
