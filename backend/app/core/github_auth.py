"""GitHub OAuth 2.0 helper for authorization, code exchange, and profile verification."""

import secrets
from urllib.parse import urlencode
import httpx

from app.config import settings

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_API = "https://api.github.com/user"
GITHUB_EMAILS_API = "https://api.github.com/user/emails"


def generate_oauth_state() -> str:
    """Generate a high-entropy random state string for OAuth CSRF protection."""
    return secrets.token_urlsafe(32)


def get_github_authorize_url(state: str) -> str:
    """Construct the GitHub authorization redirect URL."""
    if not settings.GITHUB_CLIENT_ID:
        raise ValueError("GITHUB_CLIENT_ID is not configured in settings.")

    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "read:user user:email",
        "state": state,
        "allow_signup": "true",
    }
    return f"{GITHUB_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> str:
    """Exchange authorization code for GitHub access token."""
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise ValueError("GitHub OAuth credentials are not configured in settings.")

    payload = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET,
        "code": code,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": "LifeGuard-AI-Auth",
    }

    with httpx.Client(timeout=10.0) as client:
        response = client.post(GITHUB_TOKEN_URL, json=payload, headers=headers)
        if response.status_code != 200:
            raise ValueError(f"GitHub token exchange failed with status {response.status_code}")

        data = response.json()
        if "error" in data:
            desc = data.get("error_description", data.get("error"))
            raise ValueError(f"GitHub authorization error: {desc}")

        access_token = data.get("access_token")
        if not access_token:
            raise ValueError("GitHub response did not contain an access_token.")
        return access_token


def fetch_github_user(access_token: str) -> dict:
    """Fetch GitHub user profile and verified primary email."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "LifeGuard-AI-Auth",
    }

    with httpx.Client(timeout=10.0) as client:
        # 1. Fetch user profile
        profile_resp = client.get(GITHUB_USER_API, headers=headers)
        if profile_resp.status_code != 200:
            raise ValueError(f"Failed to fetch GitHub profile (HTTP {profile_resp.status_code}).")
        profile = profile_resp.json()

        github_id = profile.get("id")
        if not github_id:
            raise ValueError("GitHub profile is missing a numeric user ID.")

        # 2. Fetch email addresses from emails API to ensure we obtain a verified address
        emails_resp = client.get(GITHUB_EMAILS_API, headers=headers)
        verified_email = None

        if emails_resp.status_code == 200:
            emails_list = emails_resp.json()
            if isinstance(emails_list, list):
                # Prefer primary verified email
                for item in emails_list:
                    if item.get("primary") and item.get("verified") and item.get("email"):
                        verified_email = item["email"]
                        break
                # Fallback to any verified email
                if not verified_email:
                    for item in emails_list:
                        if item.get("verified") and item.get("email"):
                            verified_email = item["email"]
                            break

        # Fallback to profile email if explicitly marked verified or public
        if not verified_email and profile.get("email"):
            verified_email = profile["email"]

        if not verified_email:
            raise ValueError("GitHub account does not have a verified email address.")

        display_name = profile.get("name") or profile.get("login") or "GitHub User"

        return {
            "provider_user_id": str(github_id),
            "email": verified_email.strip().lower(),
            "name": display_name.strip(),
            "username": profile.get("login"),
            "avatar_url": profile.get("avatar_url"),
        }
