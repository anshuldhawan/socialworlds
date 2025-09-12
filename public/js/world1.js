import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Multiplayer setup
const socket = io();
let localUser = null;
const remoteUsers = new Map();
const userAvatars = new Map();
const userAnimationMixers = new Map();
const userAnimations = new Map();
const peerConnections = new Map();
let localStream = null;
let micEnabled = true;

// Avatar models and loader
const gltfLoader = new GLTFLoader();
const avatarModels = ['alien', 'robot', 'dino'];
const loadedModels = new Map();

// Load all avatar models
async function loadAvatarModels() {
  const promises = avatarModels.map(modelName => 
    new Promise((resolve) => {
      gltfLoader.load(`./models/${modelName}.glb`, (gltf) => {
        loadedModels.set(modelName, gltf);
        resolve(gltf);
      }, undefined, (error) => {
        console.warn(`Failed to load ${modelName}:`, error);
        resolve(null);
      });
    })
  );
  await Promise.all(promises);
  console.log('All avatar models loaded:', loadedModels.size);
}

// Initialize model loading
loadAvatarModels();

// Audio setup
async function setupAudio() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('Could not access microphone:', err);
  }
}
setupAudio();

// WebRTC configuration
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Create user avatar (3D model)
function createUserAvatar(userData) {
  // Use the model type assigned by the server
  const modelType = userData.modelType || avatarModels[Math.floor(Math.random() * avatarModels.length)];
  const modelData = loadedModels.get(modelType);
  
  if (!modelData) {
    console.warn(`Model ${modelType} not loaded, using fallback sphere`);
    // Fallback to sphere if model not loaded
    const geometry = new THREE.SphereGeometry(0.1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: userData.color });
    const avatar = new THREE.Mesh(geometry, material);
    avatar.position.set(userData.position.x, userData.position.y, userData.position.z);
    return avatar;
  }
  
  // Clone the model
  const avatar = modelData.scene.clone();
  avatar.position.set(userData.position.x, userData.position.y, userData.position.z);
  
  // Scale the model appropriately
  avatar.scale.setScalar(0.5);
  
  // Set up animations
  const mixer = new THREE.AnimationMixer(avatar);
  userAnimationMixers.set(userData.id, mixer);
  
  const animations = {
    idle: null,
    walking: null
  };
  
  // Find idle and walking animations
  console.log('Available animations for', modelType, ':', modelData.animations.map(a => a.name));
  
  modelData.animations.forEach((clip, index) => {
    const name = clip.name.toLowerCase();
    console.log(`Animation ${index}: ${clip.name}`);
    
    if (name.includes('idle') || name.includes('rest') || name.includes('stand') || index === 0) {
      animations.idle = mixer.clipAction(clip);
      console.log('Set idle animation:', clip.name);
    } else if (name.includes('walk') || name.includes('run') || name.includes('move') || (!animations.walking && index === 1)) {
      animations.walking = mixer.clipAction(clip);
      console.log('Set walking animation:', clip.name);
    }
  });
  
  // Fallback: use first animation as idle if none found
  if (!animations.idle && modelData.animations.length > 0) {
    animations.idle = mixer.clipAction(modelData.animations[0]);
    console.log('Fallback idle animation:', modelData.animations[0].name);
  }
  
  // Fallback: use second animation as walking if none found
  if (!animations.walking && modelData.animations.length > 1) {
    animations.walking = mixer.clipAction(modelData.animations[1]);
    console.log('Fallback walking animation:', modelData.animations[1].name);
  }
  
  userAnimations.set(userData.id, animations);
  
  // Configure and start idle animation
  if (animations.idle) {
    animations.idle.setLoop(THREE.LoopRepeat);
    animations.idle.play();
    console.log('Started idle animation for', userData.username);
  } else {
    console.warn('No idle animation found for', userData.username);
  }
  
  // Configure walking animation but don't play it yet
  if (animations.walking) {
    animations.walking.setLoop(THREE.LoopRepeat);
    console.log('Configured walking animation for', userData.username);
  }
  
  // Add username label
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  context.font = '20px Arial';
  context.fillStyle = 'white';
  context.textAlign = 'center';
  context.fillText(userData.username, 128, 40);
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(0, 1, 0);
  sprite.scale.set(0.5, 0.125, 1);
  avatar.add(sprite);
  
  // Store previous position for movement detection
  avatar.userData = {
    ...userData,
    previousPosition: { ...userData.position },
    isMoving: false
  };
  
  return avatar;
}

// WebRTC peer connection setup
async function createPeerConnection(targetUserId) {
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections.set(targetUserId, pc);
  
  // Add local stream to connection
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Handle remote stream
  pc.ontrack = (event) => {
    const remoteAudio = document.createElement('audio');
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute('data-user', targetUserId);
    document.body.appendChild(remoteAudio);
  };
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: targetUserId,
        candidate: event.candidate
      });
    }
  };
  
  return pc;
}

// Socket event handlers
socket.on('user-data', (userData) => {
  localUser = userData;
  console.log('Connected as:', userData.username);
});
 
socket.on('existing-users', async (users) => {
  // Wait for models to load if they haven't yet
  while (loadedModels.size < avatarModels.length) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  users.forEach(userData => {
    remoteUsers.set(userData.id, userData);
    const avatar = createUserAvatar(userData);
    userAvatars.set(userData.id, avatar);
    scene.add(avatar);
    
    // Initialize WebRTC connection
    createPeerConnection(userData.id);
  });
});
 
socket.on('user-joined', async (userData) => {
  // Wait for models to load if they haven't yet
  while (loadedModels.size < avatarModels.length) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  remoteUsers.set(userData.id, userData);
  const avatar = createUserAvatar(userData);
  userAvatars.set(userData.id, avatar);
  scene.add(avatar);
  
  // Create WebRTC offer
  const pc = await createPeerConnection(userData.id);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', { target: userData.id, offer });
});
 
socket.on('user-left', (userId) => {
  const avatar = userAvatars.get(userId);
  if (avatar) {
    scene.remove(avatar);
    userAvatars.delete(userId);
  }
  
  // Clean up animation mixer
  const mixer = userAnimationMixers.get(userId);
  if (mixer) {
    mixer.stopAllAction();
    userAnimationMixers.delete(userId);
  }
  userAnimations.delete(userId);
  
  remoteUsers.delete(userId);
  
  // Clean up WebRTC connection
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }
  
  // Remove audio element
  const audioEl = document.querySelector(`audio[data-user="${userId}"]`);
  if (audioEl) audioEl.remove();
});
 
socket.on('user-moved', (data) => {
  const user = remoteUsers.get(data.id);
  const avatar = userAvatars.get(data.id);
  if (user && avatar) {
    const oldPos = user.position;
    user.position = data.position;
    avatar.position.set(data.position.x, data.position.y, data.position.z);
    
    // Calculate movement for animation
    const distance = Math.sqrt(
      Math.pow(data.position.x - oldPos.x, 2) +
      Math.pow(data.position.y - oldPos.y, 2) +
      Math.pow(data.position.z - oldPos.z, 2)
    );
    
    const isMoving = distance > 0.001;
    
    // Clear any existing idle timer for this user
    if (userMovementTimers.has(data.id)) {
      clearTimeout(userMovementTimers.get(data.id));
      userMovementTimers.delete(data.id);
    }
    
    if (isMoving) {
      // User is moving - immediately switch to walking
      updateUserAnimation(data.id, true);
    } else {
      // User stopped - set a timer to switch to idle after delay
      const timer = setTimeout(() => {
        updateUserAnimation(data.id, false);
        userMovementTimers.delete(data.id);
      }, 800); // 800ms delay to avoid rapid switching
      userMovementTimers.set(data.id, timer);
    }
  }
});
 
// WebRTC signaling
socket.on('offer', async (data) => {
  const pc = await createPeerConnection(data.sender);
  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { target: data.sender, answer });
});
 
socket.on('answer', async (data) => {
  const pc = peerConnections.get(data.sender);
  if (pc) {
    await pc.setRemoteDescription(data.answer);
  }
});
 
socket.on('ice-candidate', async (data) => {
  const pc = peerConnections.get(data.sender);
  if (pc && pc.remoteDescription) {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (error) {
      console.warn('Failed to add ICE candidate:', error);
    }
  } else {
    console.warn('Received ICE candidate before remote description was set');
  }
});

// Mic toggle
document.getElementById('mic-toggle').addEventListener('click', () => {
  if (localStream) {
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled;
    });
    const button = document.getElementById('mic-toggle');
    button.textContent = micEnabled ? '🎤 ON' : '🎤 OFF';
    button.style.background = micEnabled ? '#00ff00' : '#ff0000';
  }
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0.97, 0.02, -3.49);
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
let desiredPixelRatio = Math.min(window.devicePixelRatio, 1.0);
const minPixelRatio = 0.5;
const maxPixelRatio = Math.min(1.5, window.devicePixelRatio);
renderer.setPixelRatio(desiredPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.debug.checkShaderErrors = false;

// Basic lighting isn't required for splats, but adding a neutral background helps
renderer.setClearColor(0x000000, 1);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.2;
controls.maxDistance = 50;

// Load local SPZ file
const splatURL = './world1.spz';
const world = new SplatMesh({ url: splatURL });
// Orient and position so it's visible
world.quaternion.set(1, 0, 0, 0);
world.position.set(0, 0, -3);
scene.add(world);
world.updateMatrix();
world.matrixAutoUpdate = false;
controls.target.set(0, 0, -3);
controls.update();

// Camera bounds: keep camera and target within a sphere around the mesh center
const boundsCenter = controls.target.clone();
let boundsRadius = 2.0; // fallback radius if we can't infer
// Try to infer radius if available on the object
try {
  if (world.geometry && world.geometry.boundingSphere) {
    world.geometry.computeBoundingSphere();
    if (world.geometry.boundingSphere && world.geometry.boundingSphere.radius) {
      boundsRadius = world.geometry.boundingSphere.radius;
    }
  } else if (world.boundingSphere && world.boundingSphere.radius) {
    boundsRadius = world.boundingSphere.radius;
  }
} catch (_) {}
// Leave a small margin so we don't clip the boundary exactly
const boundsMargin = 0.02;
controls.maxDistance = Math.max(0.05, boundsRadius - boundsMargin);

function clampToBounds() {
  const maxDist = Math.max(0.05, boundsRadius - boundsMargin);
  const offset = new THREE.Vector3().subVectors(camera.position, boundsCenter);
  const dist = offset.length();
  if (dist > maxDist) {
    offset.normalize().multiplyScalar(maxDist);
    camera.position.copy(boundsCenter).add(offset);
  }
  const tOffset = new THREE.Vector3().subVectors(controls.target, boundsCenter);
  const tDist = tOffset.length();
  const tMax = Math.max(0.0, boundsRadius - boundsMargin);
  if (tDist > tMax) {
    tOffset.normalize().multiplyScalar(tMax);
    controls.target.copy(boundsCenter).add(tOffset);
  }
}
controls.addEventListener('change', clampToBounds);
// Expose a simple tuner in console if needed
window.setBoundsRadius = (r) => { boundsRadius = Math.max(0.1, Number(r) || boundsRadius); controls.maxDistance = Math.max(0.05, boundsRadius - boundsMargin); clampToBounds(); };

// Handle resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(desiredPixelRatio);
}
window.addEventListener('resize', onWindowResize);

// Keyboard navigation (WASD to move, QE up/down, arrows also supported)
const pressed = new Set();
window.addEventListener('keydown', (e) => {
  pressed.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => {
  pressed.delete(e.key.toLowerCase());
});

const moveSpeedUnitsPerSecond = 1.5;
const fastMultiplier = 3.0; // hold Shift for faster move
let lastTimeMs = 0;
let fpsEma = 0; // smoothed FPS
const fpsAlpha = 0.1; // 0..1, higher = less smoothing
let lastScaleAdjustMs = 0;
 
// Local user animation tracking
let isLocalUserMoving = false;
const userMovementTimers = new Map();

function updateKeyboardNavigation(deltaSeconds) {
  let forward = 0;
  let right = 0;
  let upAxis = 0;

  if (pressed.has('w') || pressed.has('arrowup')) forward += 1;
  if (pressed.has('s') || pressed.has('arrowdown')) forward -= 1;
  if (pressed.has('d') || pressed.has('arrowright')) right += 1;
  if (pressed.has('a') || pressed.has('arrowleft')) right -= 1;
  if (pressed.has('e')) upAxis += 1;
  if (pressed.has('q')) upAxis -= 1;

  const currentlyMoving = (forward !== 0 || right !== 0 || upAxis !== 0);
  
  // Update local user animation when movement state changes
  if (localUser && currentlyMoving !== isLocalUserMoving) {
    isLocalUserMoving = currentlyMoving;
    updateUserAnimation(localUser.id, isLocalUserMoving);
  }
  
  if (!currentlyMoving) return;

  const speed = moveSpeedUnitsPerSecond * (pressed.has('shift') ? fastMultiplier : 1.0);
  const distance = speed * deltaSeconds;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); // forward vector
  const rightVec = dir.clone().cross(camera.up).normalize();
  const upVec = camera.up.clone().normalize();

  const move = new THREE.Vector3();
  move.addScaledVector(dir, forward);
  move.addScaledVector(rightVec, right);
  move.addScaledVector(upVec, upAxis);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(distance);

  camera.position.add(move);
  controls.target.add(move);
  clampToBounds();
}

// HUD
const hud = document.getElementById('hud');
const usersList = document.getElementById('users-list');
 
function updateHUD() {
  const p = camera.position;
  const pr = renderer.getPixelRatio().toFixed(2);
  let heap = 'n/a';
  // Chrome-only: performance.memory
  if (performance && performance.memory && performance.memory.usedJSHeapSize) {
    heap = `${(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0)}MB`;
  }
  const mem = renderer.info.memory;
  const username = localUser ? localUser.username : 'Connecting...';
  hud.textContent = `${username}\nfps: ${fpsEma.toFixed(1)}  pr: ${pr}  heap: ${heap}\ngeo: ${mem.geometries} tex: ${mem.textures}\npos: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
  
  // Update users list
  const userCount = remoteUsers.size + (localUser ? 1 : 0);
  let usersText = `Users (${userCount}):\n`;
  if (localUser) usersText += `• ${localUser.username} (you)\n`;
  remoteUsers.forEach(user => {
    usersText += `• ${user.username}\n`;
  });
  usersList.textContent = usersText;
}
 
// Animation management
function updateUserAnimation(userId, isMoving) {
  const animations = userAnimations.get(userId);
  if (!animations) {
    console.warn('No animations found for user:', userId);
    return;
  }
  
  const user = remoteUsers.get(userId) || localUser;
  const username = user ? user.username : userId;
  
  if (isMoving) {
    // Switch to walking animation
    if (animations.walking) {
      if (animations.idle) {
        animations.idle.stop();
      }
      animations.walking.play();
      console.log(`${username}: switched to walking`);
    } else {
      console.warn(`${username}: no walking animation available`);
    }
  } else {
    // Switch to idle animation
    if (animations.idle) {
      if (animations.walking) {
        animations.walking.stop();
      }
      animations.idle.play();
      console.log(`${username}: switched to idle`);
    } else {
      console.warn(`${username}: no idle animation available`);
    }
  }
}

// Animate
renderer.setAnimationLoop((time) => {
  const dt = lastTimeMs === 0 ? 0 : (time - lastTimeMs) / 1000;
  lastTimeMs = time;

  if (dt > 0) {
    const inst = 1 / dt;
    fpsEma = fpsEma === 0 ? inst : fpsEma + fpsAlpha * (inst - fpsEma);
  }

  // Dynamic resolution scaling (adjust every ~500ms)
  if (time - lastScaleAdjustMs > 500) {
    let changed = false;
    if (fpsEma && fpsEma < 30 && desiredPixelRatio > minPixelRatio) {
      desiredPixelRatio = Math.max(minPixelRatio, desiredPixelRatio - 0.05);
      changed = true;
    } else if (fpsEma && fpsEma > 58 && desiredPixelRatio < maxPixelRatio) {
      desiredPixelRatio = Math.min(maxPixelRatio, desiredPixelRatio + 0.05);
      changed = true;
    }
    if (changed) {
      renderer.setPixelRatio(desiredPixelRatio);
    }
    lastScaleAdjustMs = time;
  }

  updateKeyboardNavigation(dt);
  controls.update();
  clampToBounds();
  updateHUD();
  
  // Update animation mixers
  userAnimationMixers.forEach(mixer => {
    mixer.update(dt);
  });
  
  // Update local user position
  if (localUser) {
    const newPos = {
      x: parseFloat(camera.position.x.toFixed(2)),
      y: parseFloat(camera.position.y.toFixed(2)),
      z: parseFloat(camera.position.z.toFixed(2))
    };
    
    // Only send update if position changed significantly
    const oldPos = localUser.position;
    const distance = Math.sqrt(
      Math.pow(newPos.x - oldPos.x, 2) +
      Math.pow(newPos.y - oldPos.y, 2) +
      Math.pow(newPos.z - oldPos.z, 2)
    );
    
    if (distance > 0.01) {
      localUser.position = newPos;
      socket.emit('update-position', newPos);
    }
  }
  
  renderer.render(scene, camera);
});


