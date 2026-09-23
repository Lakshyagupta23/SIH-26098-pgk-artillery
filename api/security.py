import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db

# Security Configuration
SECRET_KEY = os.environ.get("SECRET_KEY", "")
_KNOWN_PLACEHOLDERS = {"your_secret_key_here", "CHANGE_ME", "changeme", "secret"}
_AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "False").lower() == "true"
_IS_PRODUCTION = os.environ.get("ENVIRONMENT", "development").lower() == "production"

if _IS_PRODUCTION and not _AUTH_ENABLED:
    raise RuntimeError("AUTH_ENABLED=False is not allowed in production. You must enable authentication to secure the API.")

# In production or when auth is enabled, enforce a real secret key.
# Fail fast rather than run with a predictable placeholder.
if _AUTH_ENABLED or _IS_PRODUCTION:
    if not SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY environment variable is missing. "
            "Generate a secure key: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if SECRET_KEY in _KNOWN_PLACEHOLDERS or len(SECRET_KEY) < 32:
        raise RuntimeError(
            "SECRET_KEY is set to a known placeholder or is too short (minimum 32 characters). "
            "Generate a secure key: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
elif not SECRET_KEY or SECRET_KEY in _KNOWN_PLACEHOLDERS:
    # Development/test: warn but do not crash. Use a deterministic dev key.
    import warnings
    warnings.warn(
        "SECRET_KEY is not configured or is a placeholder. "
        "This is acceptable for local development (AUTH_ENABLED=False) "
        "but MUST be replaced before any production deployment.",
        stacklevel=1
    )
    SECRET_KEY = "dev-only-insecure-key-do-not-use-in-production-000000"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

class TokenData(BaseModel):
    username: str | None = None
    role: str | None = None

import bcrypt


def verify_password(plain_password, hashed_password):
    if isinstance(plain_password, str):
        plain_password = plain_password.encode('utf-8')
    if isinstance(hashed_password, str):
        hashed_password = hashed_password.encode('utf-8')
    return bcrypt.checkpw(plain_password, hashed_password)

def get_password_hash(password):
    if isinstance(password, str):
        password = password.encode('utf-8')
    return bcrypt.hashpw(password, bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(datetime.UTC) + expires_delta
    else:
        expire = datetime.now(datetime.UTC) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    auth_enabled = os.environ.get("AUTH_ENABLED", "False").lower() == "true"
    
    # If auth is disabled for local frontend development, return a mock admin
    if not auth_enabled:
        user = db.query(models.User).filter(models.User.username == "admin").first()
        if user:
            return user
        return models.User(id=0, username="admin", role="ADMIN", is_active=True)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username, role=payload.get("role"))
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

class RequireRole:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: models.User = Depends(get_current_active_user)):
        auth_enabled = os.environ.get("AUTH_ENABLED", "False").lower() == "true"
        if not auth_enabled:
            return current_user
            
        if current_user.role not in self.allowed_roles and current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Requires one of: {', '.join(self.allowed_roles)}"
            )
        return current_user

def audit_log(db: Session, user_id: int | None, action: str, resource: str, details: str | None = None):
    log_entry = models.AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        details=details
    )
    db.add(log_entry)
    db.commit()
