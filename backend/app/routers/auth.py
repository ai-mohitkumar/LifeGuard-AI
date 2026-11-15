"""Authentication router: register, login, Google OAuth, GitHub OAuth, logout, and profile."""

import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.github_auth import (
    exchange_code_for_token,
    fetch_github_user,
    generate_oauth_state,
    get_github_authorize_url,
)
from app.core.google_auth import verify_google_id_token
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.database import get_db
from app.models.user import OAuthAccount, User
from app.schemas.auth import (
    AuthTokenResponse,
    GoogleAuthRequest,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_or_create_oauth_user(
    db: Session,
    provider: str,
    provider_user_id: str,
    email: str,
    full_name: str,
) -> User:
    """Find an existing user via linked OAuthAccount, or safely link/provision a new account."""
    normalized_email = email.strip().lower()
    clean_provider_user_id = str(provider_user_id).strip()

    # 1. Search for existing OAuthAccount by unique provider identity
    oauth_acc = db.query(OAuthAccount).filter(
        OAuthAccount.provider == provider,
        OAuthAccount.provider_user_id == clean_provider_user_id,
    ).first()

    if oauth_acc is not None:
        user = oauth_acc.user
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is inactive.",
            )
        # Prevent account hijacking / identity conflict if token email belongs to another existing user
        if user.email != normalized_email:
            other_user = db.query(User).filter(User.email == normalized_email).first()
            if other_user is not None and other_user.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"This {provider.capitalize()} identity is already linked to a different user account.",
                )
        return user

    # 2. Search for existing User by verified email
    user = db.query(User).filter(User.email == normalized_email).first()

    if user is not None:
        # Check if this user already has an OAuth account for THIS provider with a different ID
        existing_provider_link = db.query(OAuthAccount).filter(
            OAuthAccount.user_id == user.id,
            OAuthAccount.provider == provider,
        ).first()

        if existing_provider_link is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This user account is already linked to a different {provider.capitalize()} account.",
            )

        # Link this new verified provider to existing user
        new_link = OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=clean_provider_user_id,
            provider_email=normalized_email,
        )
        db.add(new_link)
        db.commit()
        db.refresh(user)
    else:
        # 3. Create fresh User and link OAuthAccount
        random_pass = secrets.token_urlsafe(32)
        user = User(
            full_name=full_name.strip()[:100],
            email=normalized_email,
            hashed_password=hash_password(random_pass),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        new_link = OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=clean_provider_user_id,
            provider_email=normalized_email,
        )
        db.add(new_link)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive.",
        )

    return user


@router.post(
    "/register",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    payload: UserRegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    """Register a new user account with email + password, set HttpOnly cookie, and return JWT."""
    normalized_email = payload.email.strip().lower()

    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=payload.full_name.strip(),
        email=normalized_email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    set_auth_cookie(response, token)
    return AuthTokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=AuthTokenResponse, status_code=status.HTTP_200_OK)
def login_user(
    payload: UserLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    """Authenticate an existing user with email + password, set HttpOnly cookie, and issue JWT."""
    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    # Generic error message to prevent account enumeration
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive.",
        )

    token = create_access_token(subject=str(user.id))
    set_auth_cookie(response, token)
    return AuthTokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/google",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_200_OK,
)
def google_auth(
    payload: GoogleAuthRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    """Verify Google Identity Services ID token, link/provision user, set cookie, and return JWT."""
    try:
        idinfo = verify_google_id_token(payload.id_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google authentication failed: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google token verification error: {exc}",
        )

    email = idinfo["email"]
    sub = idinfo.get("sub") or idinfo.get("user_id")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token missing immutable subject claim.",
        )
    name = idinfo.get("name") or email.split("@")[0].capitalize()

    user = get_or_create_oauth_user(
        db=db,
        provider="google",
        provider_user_id=str(sub),
        email=email,
        full_name=name,
    )

    token = create_access_token(subject=str(user.id))
    set_auth_cookie(response, token)
    return AuthTokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/github/login", status_code=status.HTTP_302_FOUND)
def github_login():
    """Initiate GitHub OAuth flow with high-entropy state to prevent CSRF."""
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    if not settings.GITHUB_CLIENT_ID:
        return RedirectResponse(
            url=f"{frontend_url}/login?auth_error=GitHub+OAuth+is+not+configured+yet.+Please+set+GITHUB_CLIENT_ID+in+the+environment.",
            status_code=status.HTTP_302_FOUND,
        )

    state = generate_oauth_state()
    auth_url = get_github_authorize_url(state)

    redirect_resp = RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)
    is_secure = settings.COOKIE_SECURE or (settings.ENVIRONMENT.lower() == "production")
    redirect_resp.set_cookie(
        key="github_oauth_state",
        value=state,
        max_age=900,  # 15 minutes
        expires=900,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        path="/",
    )
    return redirect_resp


@router.get("/github/callback")
def github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Validate GitHub authorization callback, verify user & email, and issue JWT session."""
    frontend_url = settings.FRONTEND_URL.rstrip("/")

    # Handle GitHub user cancellation or error
    if error:
        return RedirectResponse(
            url=f"{frontend_url}/login?auth_error={error}",
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth code or state parameter.",
        )

    # Validate state to prevent CSRF login attacks
    stored_state = request.cookies.get("github_oauth_state")
    if not stored_state or stored_state != state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state parameter.",
        )

    # Exchange authorization code for GitHub access token
    try:
        github_token = exchange_code_for_token(code)
    except ValueError as exc:
        return RedirectResponse(
            url=f"{frontend_url}/login?auth_error={str(exc)}",
            status_code=status.HTTP_302_FOUND,
        )

    # Fetch verified user profile & email
    try:
        gh_user = fetch_github_user(github_token)
    except ValueError as exc:
        return RedirectResponse(
            url=f"{frontend_url}/login?auth_error={str(exc)}",
            status_code=status.HTTP_302_FOUND,
        )

    # Find or link user & OAuthAccount
    try:
        user = get_or_create_oauth_user(
            db=db,
            provider="github",
            provider_user_id=gh_user["provider_user_id"],
            email=gh_user["email"],
            full_name=gh_user["name"],
        )
    except HTTPException as exc:
        return RedirectResponse(
            url=f"{frontend_url}/login?auth_error={exc.detail}",
            status_code=status.HTTP_302_FOUND,
        )

    token = create_access_token(subject=str(user.id))
    redirect_resp = RedirectResponse(
        url=f"{frontend_url}/login?auth_token={token}",
        status_code=status.HTTP_302_FOUND,
    )
    set_auth_cookie(redirect_resp, token)
    redirect_resp.delete_cookie(key="github_oauth_state", path="/")
    return redirect_resp


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout_user(response: Response) -> dict[str, str]:
    """Clear session cookie and invalidate active browser session."""
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Return the currently authenticated user's profile."""
    return UserResponse.model_validate(current_user)
