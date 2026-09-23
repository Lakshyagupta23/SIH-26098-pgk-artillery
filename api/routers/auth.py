from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import models
from api.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    audit_log,
    create_access_token,
    get_current_active_user,
    verify_password,
)
from database import get_db

router = APIRouter(tags=["Authentication"])

@router.post("/auth/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        audit_log(db, None, "LOGIN_FAILED", "auth", f"Attempt for user: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    
    audit_log(db, user.id, "LOGIN_SUCCESS", "auth", None)
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/auth/me")
def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "is_active": current_user.is_active
    }
