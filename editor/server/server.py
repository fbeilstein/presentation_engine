import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
import json

app = FastAPI()

# Mount the workspace root. Ensure this server is run from the workspace root.
WORKSPACE_ROOT = Path(os.getcwd())

class JournalMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "GET" and not request.url.path.startswith("/api/"):
            path_str = request.url.path.lstrip("/")
            journal_path = WORKSPACE_ROOT / ".journal.json"
            if journal_path.is_file():
                try:
                    with open(journal_path, "r", encoding="utf-8") as f:
                        journal = json.load(f)
                    
                    # Search from newest to oldest patch
                    for entry in reversed(journal):
                        if entry.get("type") == "fileCache" and "cache" in entry:
                            if path_str in entry["cache"]:
                                return Response(content=entry["cache"][path_str], media_type="text/markdown" if path_str.endswith(".md") else "text/html" if path_str.endswith(".html") else "text/plain")
                        elif entry.get("file") == path_str: # Legacy support
                            return Response(content=entry.get("content", ""), media_type="text/markdown" if path_str.endswith(".md") else "text/html" if path_str.endswith(".html") else "text/plain")
                except Exception:
                    pass
        return await call_next(request)

app.add_middleware(JournalMiddleware)

class FileSaveRequest(BaseModel):
    path: str
    content: str

class FileNewRequest(BaseModel):
    path: str
    is_dir: bool

class JournalRequest(BaseModel):
    journal: list

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

@app.get("/api/exists")
def check_exists(path: str):
    file_path = WORKSPACE_ROOT / path
    return {"exists": file_path.exists()}

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

@app.delete("/api/file")
def delete_file(path: str):
    file_path = WORKSPACE_ROOT / path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    try:
        if file_path.is_file():
            file_path.unlink()
        elif file_path.is_dir():
            import shutil
            shutil.rmtree(file_path)
        return {"status": "ok"}
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

@app.get("/api/journal")
def get_journal():
    journal_path = WORKSPACE_ROOT / ".journal.json"
    if not journal_path.is_file():
        return {"journal": []}
    try:
        import json
        with open(journal_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {"journal": data}
    except Exception as e:
        return {"journal": []}

@app.post("/api/journal")
def save_journal(req: JournalRequest):
    journal_path = WORKSPACE_ROOT / ".journal.json"
    try:
        import json
        with open(journal_path, "w", encoding="utf-8") as f:
            json.dump(req.journal, f)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear-journal")
def clear_journal():
    journal_path = WORKSPACE_ROOT / ".journal.json"
    if journal_path.exists():
        try:
            journal_path.unlink()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

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

