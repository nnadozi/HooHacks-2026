import httpx
from fastapi import HTTPException, Request
from jose import JWTError, jwt

from app.config import get_settings

_jwks: dict | None = None


async def get_jwks() -> dict:
    global _jwks
    if _jwks is None:
        settings = get_settings()
        url = f"https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            resp.raise_for_status()
            _jwks = resp.json()
    return _jwks


async def get_signing_key(token: str) -> dict:
    jwks = await get_jwks()
    unverified_header = jwt.get_unverified_header(token)
    for key in jwks["keys"]:
        if key["kid"] == unverified_header.get("kid"):
            return key
    raise HTTPException(
        status_code=401,
        detail={"error": "Unable to find signing key", "code": "UNAUTHORIZED"},
    )


async def verify_token(request: Request) -> str:
    """Extract and validate the Auth0 JWT from the Authorization header.

    Returns the user_id (JWT 'sub' claim).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": "Missing bearer token", "code": "UNAUTHORIZED"},
        )

    token = auth_header.split(" ", 1)[1]
    signing_key = await get_signing_key(token)
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.AUTH0_AUDIENCE,
            issuer=f"https://{settings.AUTH0_DOMAIN}/",
        )
        return payload["sub"]
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail={"error": f"Invalid token: {e}", "code": "UNAUTHORIZED"},
        )
