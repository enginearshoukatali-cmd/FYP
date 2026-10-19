# فائل کا نام اور لوکیشن: backend/security.py

import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from dotenv import load_dotenv

load_dotenv()

# Environment variables se keys load karein
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY must be configured with at least 32 characters.")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# Bcrypt password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# --- اس پرانے کوڈ کی جگہ ---
# def get_password_hash(password: str) -> str:
#     return pwd_context.hash(password)
#
# def verify_password(plain_password: str, hashed_password: str) -> bool:
#     return pwd_context.verify(plain_password, hashed_password)


# --- یہ نیا کوڈ پیسٹ کریں ---
def get_password_hash(password: str) -> str:
    return pwd_context.hash(_bcrypt_safe_password(password))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(_bcrypt_safe_password(plain_password), hashed_password)
    except (TypeError, ValueError, UnknownHashError):
        return False


def _bcrypt_safe_password(password: str) -> str:
    """Keep bcrypt input within 72 bytes without splitting a UTF-8 character."""
    return password.encode("utf-8")[:72].decode("utf-8", errors="ignore")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
