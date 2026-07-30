from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router

app = FastAPI(title="江滩智防 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
