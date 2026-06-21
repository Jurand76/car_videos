from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../../project.env", ".env"),
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://carphotos:carphotos@localhost:5432/carphotos"
    jwt_secret: str = "dev-secret-change-in-production-32chars"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3010"
    upload_dir: str = "./storage/uploads"
    max_upload_mb: int = 20
    openai_api_key: str = ""
    openai_admin_api_key: str = ""
    openai_image_model: str = "gpt-image-2"
    openai_image_quality: str = "high"
    openai_image_size: str = "auto"
    # Równoległe przetwarzanie serii zdjęć (OpenAI IPM). Tier 1 ≈ 5/min → domyślnie 3.
    series_parallel_workers: int = 3

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
