"""Server-side Google ID Token verification using official google-auth library."""

from google.auth.transport import requests
from google.oauth2 import id_token

from app.config import settings

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


def verify_google_id_token(token: str, client_id: str | None = None) -> dict:
    """Verify a Google ID Token's signature, issuer, audience, and expiry.

    Args:
        token: Raw Google JWT ID token string from Google Identity Services.
        client_id: Expected Google OAuth 2.0 client ID (defaults to settings.GOOGLE_CLIENT_ID).

    Returns:
        Dictionary containing verified user claims (sub, email, email_verified, name, etc.).

    Raises:
        ValueError: If the token is invalid, expired, issuer is untrusted,
                    audience does not match, or email is unverified.
    """
    if not token or not isinstance(token, str) or not token.strip():
        raise ValueError("Google ID token cannot be empty.")

    target_client_id = client_id or settings.GOOGLE_CLIENT_ID
    request = requests.Request()

    try:
        # verify_oauth2_token validates cryptographic signature with Google certs,
        # checks expiration (exp), checks issuance (iat), and checks audience (aud).
        idinfo = id_token.verify_oauth2_token(
            token.strip(),
            request,
            audience=target_client_id,
        )
    except Exception as exc:
        raise ValueError(f"Google ID token verification failed: {exc}") from exc

    # Enforce trusted Google token issuer
    issuer = idinfo.get("iss")
    if issuer not in GOOGLE_ISSUERS:
        raise ValueError(f"Invalid Google token issuer: {issuer}")

    # Enforce verified email address
    if not idinfo.get("email_verified", False):
        raise ValueError("Google account email is not verified.")

    # Enforce presence of email
    email = idinfo.get("email")
    if not email or not isinstance(email, str) or not email.strip():
        raise ValueError("Google ID token is missing an email address.")

    return idinfo
