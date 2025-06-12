from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn
import argparse
import sys
import asyncio

app = FastAPI(
    title="My Universe Server",
    description="A simple FastAPI server with health check and hello world endpoints",
    version="0.0.0"
)


@app.get("/")
async def root():
    """Hello World API endpoint"""
    return {"message": "Hello World from My Universe Server!"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(
        status_code=200,
        content={"status": "healthy", "message": "Server is running"}
    )


@app.get("/hello/{name}")
async def hello_name(name: str):
    """Hello endpoint with name parameter"""
    return {"message": f"Hello {name}!"}


@app.get("/api/universe")
async def universe_data():
    """返回宇宙数据"""
    return {
        "stars": 200,
        "planets": 8,
        "galaxies": 1,
        "status": "exploring"
    }


def main():
    """Run the FastAPI server"""
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", default="serve")
    parser.add_argument("port", type=int, nargs="?", default=8000)
    args = parser.parse_args()
    
    # 启动 FastAPI 服务
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=args.port, 
        log_level="info",
        access_log=True
    )

if __name__ == "__main__":
    main()
