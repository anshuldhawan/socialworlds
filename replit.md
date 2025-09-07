# World1 • Spark + Three.js

## Overview
This is a 3D visualization web application built with Three.js and the Spark library. It renders SPZ (splat) files in an interactive 3D environment with orbit controls, keyboard navigation, and performance monitoring.

## Project Architecture
- **Frontend**: Static HTML file with ES6 modules
- **Dependencies**: Loaded via CDN (Three.js, Spark library)
- **3D Assets**: SPZ files for 3D gaussian splat rendering
- **Server**: Simple Python HTTP server for static file serving

## Current Setup
- Configured to run on port 5000 with 0.0.0.0 binding for Replit compatibility
- Deployment configured for autoscale (stateless web application)
- Uses Python's built-in HTTP server for serving static files

## Recent Changes (Sep 7, 2025)
- Set up Replit environment with proper port configuration
- Configured deployment for production autoscale
- Verified SPZ file loading and 3D rendering functionality

## Features
- Interactive 3D orbit controls
- Keyboard navigation (WASD + QE for movement)
- Dynamic resolution scaling based on performance
- Real-time FPS and memory monitoring
- Camera bounds enforcement around 3D models