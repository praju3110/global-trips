# Use python:3.11-slim as base image for lightweight production container
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory
WORKDIR /workspace

# Install system dependencies if required for compiled assets
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY requirements.txt /workspace/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code into the container
COPY . /workspace/

# Expose default port
EXPOSE 8080

# Run Uvicorn listening on port injected by GCP Cloud Run
CMD exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}
