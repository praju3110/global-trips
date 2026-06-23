"""Main FastAPI application assembly."""
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware

import byos
from app.db import db, client
from app.websocket import manager
from app.routers import users, trips, itinerary, travel, expenses, media, dining

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="RoamSync API")

# Mount Routers
app.include_router(users.router)
app.include_router(trips.router)
app.include_router(itinerary.router)
app.include_router(travel.router)
app.include_router(expenses.router)
app.include_router(media.router)
app.include_router(dining.router)
app.include_router(byos.router)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api")
@app.get("/api/")
async def root():
    """Root health check endpoint."""
    return {"message": "RoamSync API", "status": "ok"}


@app.websocket("/api/trips/{trip_id}/sync")
async def websocket_endpoint(websocket: WebSocket, trip_id: str):
    """WebSocket endpoint for real-time trip synchronization."""
    await manager.connect(websocket, trip_id)
    try:
        while True:
            # Maintain connection; can also receive messages from clients if needed
            data = await websocket.receive_text()
            logger.info(f"Received WebSocket message from client on trip {trip_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, trip_id)
    except Exception as e:
        logger.warning(f"WebSocket error on trip {trip_id}: {e}")
        manager.disconnect(websocket, trip_id)


@app.on_event("startup")
async def startup_indexes():
    logger.info("Initializing database indexes...")
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.memberships.create_index([("trip_id", 1), ("user_id", 1)])
    await db.trips.create_index("invite_code", unique=True)
    logger.info("Database indexes initialized successfully.")


@app.on_event("shutdown")
async def shutdown_db_client():
    logger.info("Closing database client connection...")
    client.close()
    logger.info("Database client connection closed.")
