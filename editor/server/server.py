import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

# Mount the workspace root. Ensure this server is run from the workspace root.
WORKSPACE_ROOT = Path(os.getcwd())

class FileSaveRequest(BaseModel):
    path: str
    content: str

class FileNewRequest(BaseModel):
    path: str
    is_dir: bool

def build_tree(dir_path: Path):
    tree = []
    try:
        for p in sorted(dir_path.iterdir()):
            if p.name.startswith('.') or p.name in ['__pycache__', 'node_modules', '.venv']:
                continue
            item = {
                "name": p.name,
                "path": str(p.relative_to(WORKSPACE_ROOT)),
                "is_dir": p.is_dir()
            }
            if p.is_dir():
                item["children"] = build_tree(p)
            tree.append(item)
    except Exception:
        pass
    return tree

@app.get("/api/fs")
def get_fs_tree():
    return JSONResponse({"tree": build_tree(WORKSPACE_ROOT)})

@app.get("/api/file")
def get_file(path: str):
    file_path = WORKSPACE_ROOT / path
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/file")
def save_file(req: FileSaveRequest):
    file_path = WORKSPACE_ROOT / req.path
    try:
        # Create parent directories if they don't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/new")
def new_file(req: FileNewRequest):
    file_path = WORKSPACE_ROOT / req.path
    try:
        if req.is_dir:
            file_path.mkdir(parents=True, exist_ok=True)
        else:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.touch()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(path: str = Form(...), file: UploadFile = File(...)):
    file_path = WORKSPACE_ROOT / path
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"ok": True, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Fallback to serve static files from workspace root
app.mount("/", StaticFiles(directory=str(WORKSPACE_ROOT), html=True), name="static")

