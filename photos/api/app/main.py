import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import run_migrations
from app.routers import auth, backgrounds, billing, generated_files, photo_series, projects, saved_prompts
from app.services.storage import ensure_upload_dir

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_upload_dir()
    await run_migrations()
    yield
    from app.database import engine

    await engine.dispose()

app = FastAPI(
    title="AUTKA.PL API",
    description="API do komponowania zdjęć samochodów na tle studyjnym",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(backgrounds.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(photo_series.router, prefix="/api/v1/projects")
app.include_router(generated_files.router, prefix="/api/v1")
app.include_router(saved_prompts.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
