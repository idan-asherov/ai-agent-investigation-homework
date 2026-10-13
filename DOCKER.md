# Docker Deployment Guide

## Prerequisites
Ensure Ollama is running on your host machine:
```bash
ollama run qwen2.5:7b
```

## Starting Services
```bash
docker compose up --build
```

## Service URLs
- **Ops Agent Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:5002/health

## Stopping Services
```bash
docker compose down
```
