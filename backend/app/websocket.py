"""WebSocket connection manager for real-time trip collaboration."""
import logging
from typing import Dict, List, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections grouped by trip_id."""

    def __init__(self):
        # trip_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, trip_id: str):
        await websocket.accept()
        if trip_id not in self.active_connections:
            self.active_connections[trip_id] = []
        self.active_connections[trip_id].append(websocket)
        logger.info(f"WebSocket connected for trip {trip_id}. "
                     f"Active connections: {len(self.active_connections[trip_id])}")

    def disconnect(self, websocket: WebSocket, trip_id: str):
        if trip_id in self.active_connections:
            self.active_connections[trip_id] = [
                ws for ws in self.active_connections[trip_id] if ws is not websocket
            ]
            if not self.active_connections[trip_id]:
                del self.active_connections[trip_id]
        logger.info(f"WebSocket disconnected from trip {trip_id}")

    async def broadcast(self, trip_id: str, message: Dict[str, Any]):
        """Send a JSON message to all active connections for a trip."""
        if trip_id not in self.active_connections:
            return
        dead = []
        for ws in self.active_connections[trip_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        for ws in dead:
            self.disconnect(ws, trip_id)


# Singleton instance shared across the application
manager = ConnectionManager()
