import { Hono } from "hono";

/**
 * Serves the custom Egress layout page for MCU composite.
 *
 * LiveKit Egress loads this URL (via customBaseUrl) and renders it in a
 * headless Chromium instance. The page connects to the room via
 * livekit-client and renders participants with a focus layout:
 *   - The "focus" participant (identified by identity) is displayed large
 *   - Other participants are shown as small tiles in a sidebar
 *
 * Query params injected by Egress:
 *   - url: LiveKit server WebSocket URL
 *   - token: Access token for the Egress participant
 *
 * Custom query params (set via customBaseUrl):
 *   - focusIdentity: The participant identity to display as the main/focus view
 */
export const egressLayoutRoutes = new Hono();

const LAYOUT_HTML = /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #111;
    color: #fff;
    font-family: system-ui, sans-serif;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
  }
  #container {
    display: flex;
    width: 100%;
    height: 100%;
  }
  #focus {
    flex: 1;
    position: relative;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #focus video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  #focus .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #666;
    font-size: 24px;
  }
  #focus .placeholder .avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    color: #888;
  }
  #sidebar {
    width: 240px;
    min-width: 240px;
    background: #1a1a1a;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
    overflow-y: auto;
  }
  .tile {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #222;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .tile .name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 2px 6px;
    background: linear-gradient(transparent, rgba(0,0,0,0.7));
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile .no-video {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #666;
    font-size: 28px;
  }
  .speaking {
    outline: 2px solid #4ade80;
  }
  #focus-name {
    position: absolute;
    bottom: 12px;
    left: 16px;
    font-size: 18px;
    font-weight: 600;
    background: rgba(0,0,0,0.5);
    padding: 4px 12px;
    border-radius: 6px;
  }
  /* When there are no sidebar participants, use full width */
  #container.no-sidebar #sidebar { display: none; }
</style>
</head>
<body>
<div id="container">
  <div id="focus">
    <div class="placeholder" id="focus-placeholder">
      <div class="avatar" id="focus-avatar">?</div>
      <span id="focus-waiting">Waiting...</span>
    </div>
    <span id="focus-name" style="display:none"></span>
  </div>
  <div id="sidebar"></div>
</div>

<script type="module">
import {
  Room,
  RoomEvent,
  Track,
} from 'https://cdn.jsdelivr.net/npm/livekit-client@2.7.1/+esm';

const params = new URLSearchParams(window.location.search);
const wsUrl = params.get('url');
const token = params.get('token');
const focusIdentity = params.get('focusIdentity') || '';

const room = new Room({
  adaptiveStream: false,
  dynacast: false,
});

const focusEl = document.getElementById('focus');
const focusPlaceholder = document.getElementById('focus-placeholder');
const focusAvatar = document.getElementById('focus-avatar');
const focusNameEl = document.getElementById('focus-name');
const sidebar = document.getElementById('sidebar');
const container = document.getElementById('container');

let focusVideoEl = null;

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function renderFocus(participant) {
  if (!participant) {
    focusPlaceholder.style.display = 'flex';
    if (focusVideoEl) { focusVideoEl.remove(); focusVideoEl = null; }
    focusNameEl.style.display = 'none';
    focusEl.classList.remove('speaking');
    return;
  }

  const name = participant.name || participant.identity;
  focusNameEl.textContent = name;
  focusNameEl.style.display = '';

  focusEl.classList.toggle('speaking', participant.isSpeaking);

  const camPub = participant.getTrackPublication(Track.Source.Camera);
  if (camPub && camPub.track && !camPub.isMuted) {
    focusPlaceholder.style.display = 'none';
    if (!focusVideoEl) {
      focusVideoEl = camPub.track.attach();
      focusEl.insertBefore(focusVideoEl, focusNameEl);
    } else if (focusVideoEl.srcObject !== camPub.track.mediaStream) {
      camPub.track.attach(focusVideoEl);
    }
  } else {
    focusPlaceholder.style.display = 'flex';
    focusAvatar.textContent = getInitial(name);
    if (focusVideoEl) { focusVideoEl.remove(); focusVideoEl = null; }
  }
}

function renderSidebar() {
  const others = Array.from(room.remoteParticipants.values())
    .filter(p => p.identity !== focusIdentity);

  container.classList.toggle('no-sidebar', others.length === 0);

  // Reconcile DOM
  const existingTiles = new Map();
  for (const el of sidebar.querySelectorAll('.tile')) {
    existingTiles.set(el.dataset.identity, el);
  }

  const seen = new Set();
  for (const p of others) {
    seen.add(p.identity);
    let tile = existingTiles.get(p.identity);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.identity = p.identity;
      tile.innerHTML = '<div class="no-video"></div><div class="name"></div>';
      sidebar.appendChild(tile);
    }

    tile.classList.toggle('speaking', p.isSpeaking);
    const nameEl = tile.querySelector('.name');
    const displayName = p.name || p.identity;
    nameEl.textContent = displayName;

    const camPub = p.getTrackPublication(Track.Source.Camera);
    const noVideoEl = tile.querySelector('.no-video');
    let videoEl = tile.querySelector('video');

    if (camPub && camPub.track && !camPub.isMuted) {
      if (noVideoEl) noVideoEl.style.display = 'none';
      if (!videoEl) {
        videoEl = camPub.track.attach();
        tile.insertBefore(videoEl, nameEl);
      } else if (videoEl.srcObject !== camPub.track.mediaStream) {
        camPub.track.attach(videoEl);
      }
    } else {
      if (videoEl) { videoEl.remove(); }
      if (noVideoEl) {
        noVideoEl.style.display = 'flex';
        noVideoEl.textContent = getInitial(displayName);
      }
    }
  }

  // Remove tiles for participants who left
  for (const [identity, tile] of existingTiles) {
    if (!seen.has(identity)) tile.remove();
  }
}

function render() {
  // Find focus participant
  let focusParticipant = null;
  if (focusIdentity) {
    focusParticipant = room.remoteParticipants.get(focusIdentity) || null;
  }
  // If no focus set or focus participant not in room, pick the first one
  if (!focusParticipant && room.remoteParticipants.size > 0) {
    if (focusIdentity) {
      // Focus is set but participant hasn't joined yet — show placeholder
    } else {
      focusParticipant = room.remoteParticipants.values().next().value;
    }
  }
  renderFocus(focusParticipant);
  renderSidebar();
}

const RENDER_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.ActiveSpeakersChanged,
];
for (const evt of RENDER_EVENTS) {
  room.on(evt, () => render());
}

// Initial connect
await room.connect(wsUrl, token);
render();
</script>
</body>
</html>`;

egressLayoutRoutes.get("/", (_c) => {
  return new Response(LAYOUT_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});
