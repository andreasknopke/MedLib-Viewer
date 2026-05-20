from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MedLib"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://medlib:medlib@db:5432/medlib"
    secret_key: str = Field(default="change-me-in-production")
    access_token_minutes: int = 480
    cors_origins: list[AnyHttpUrl] | list[str] = ["http://localhost:5173"]
    storage_dir: Path = Path("/data/books")
    ocr_language: str = "deu+eng"
    max_upload_mb: int = 2048


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
