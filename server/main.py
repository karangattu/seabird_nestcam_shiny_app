import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import uvicorn

# Simple FastAPI backend to serve images and accept sync payloads
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

www_dir = Path(__file__).resolve().parents[1] / "www"
images_dir = www_dir / "images"
app.mount("/static", StaticFiles(directory=www_dir), name="static")


class ImageItem(BaseModel):
    id: str
    url: str
    filename: str


class SyncPayload(BaseModel):
    annotations: list[dict]


@app.get("/api/images", response_model=list[ImageItem])
async def get_images():
    items = []
    base = os.getenv("IMAGE_BASE_URL", "").rstrip("/")
    if images_dir.exists():
        for i, p in enumerate(sorted(images_dir.glob("*.jpg"))):
            if base:
                url = f"{base}/{p.name}"
            else:
                url = f"/static/images/{p.name}"
            items.append(ImageItem(id=str(i+1), url=url, filename=p.name))
    return items


@app.post("/api/sync")
async def sync(payload: SyncPayload):
    # TODO: integrate Google Sheets similar to Shiny app
    return {"ok": True, "count": len(payload.annotations)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
