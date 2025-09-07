# World1 • Spark + Three.js Multiplayer

## Overview
This is a multiplayer 3D visualization web application built with Three.js and the Spark library. It renders SPZ (splat) files in an interactive 3D environment with real-time voice communication and synchronized user presence.

## Project Architecture
- **Frontend**: HTML with ES6 modules and Socket.io client
- **Backend**: Node.js Express server with Socket.io for real-time communication
- **Dependencies**: Three.js, Spark library (CDN), Socket.io, Express, UUID
- **3D Assets**: SPZ files for 3D gaussian splat rendering
- **Communication**: WebRTC for peer-to-peer audio, WebSockets for synchronization

## Current Setup
- Node.js server running on port 5000 with 0.0.0.0 binding
- Deployment configured for autoscale
- Real-time multiplayer functionality with voice chat

## Recent Changes (Sep 7, 2025)
- Set up Replit environment with proper port configuration
- Added complete multiplayer functionality with voice communication
- Implemented real-time user synchronization and blob avatars
- Created random username generation system
- Set up WebRTC for peer-to-peer audio communication

## Features
### Core 3D Features
- Interactive 3D orbit controls
- Keyboard navigation (WASD + QE for movement)
- Dynamic resolution scaling based on performance
- Real-time FPS and memory monitoring
- Camera bounds enforcement around 3D models

### Multiplayer Features
- Real-time voice communication via WebRTC
- Blob avatars representing each user in 3D space
- Position synchronization across all connected users
- Random username assignment (e.g., "SwiftFox42")
- Microphone toggle controls
- Live user list display
- Automatic connection management