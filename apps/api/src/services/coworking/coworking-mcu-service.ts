import path from "node:path";
import { SegmentedFileSuffix } from "@livekit/protocol";
import {
  EgressClient,
  EncodingOptions,
  SegmentedFileOutput,
  SegmentedFileProtocol,
  VideoCodec,
} from "livekit-server-sdk";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../../lib/livekit-config.js";
import { getSiteSetting } from "../../repositories/admin/admin-repository.js";

const egressClient = new EgressClient(livekitHost, livekitApiKey, livekitApiSecret);

export const COWORKING_ROOM = "everybody-coworking";
// Path inside the Egress Docker container (used for SegmentedFileOutput)
const EGRESS_HLS_DIR = "/data/files/coworking-hls";
// Path on the API host (used for cleanup and serving)
const LOCAL_HLS_DIR = process.env.FILE_STORAGE_PATH
  ? path.join(process.env.FILE_STORAGE_PATH, "coworking-hls")
  : path.resolve(process.cwd(), "../../data/files/coworking-hls");

// In-memory state for the coworking composite egress
let activeEgressId: string | null = null;
let activeEgressStartedAt: string | null = null;
let startInProgress: Promise<CompositeStatus> | null = null;

export interface CompositeStatus {
  active: boolean;
  egressId: string | null;
  startedAt: string | null;
}

async function getMcuSettings() {
  const [widthRow, heightRow, fpsRow, focusRow] = await Promise.all([
    getSiteSetting("livekitCoworkingMcuWidth"),
    getSiteSetting("livekitCoworkingMcuHeight"),
    getSiteSetting("livekitCoworkingMcuFps"),
    getSiteSetting("livekitCoworkingFocusIdentity"),
  ]);
  return {
    width: widthRow?.value ? Number(widthRow.value) : 1280,
    height: heightRow?.value ? Number(heightRow.value) : 720,
    fps: fpsRow?.value ? Number(fpsRow.value) : 15,
    focusIdentity: focusRow?.value || null,
  };
}

export async function startCoworkingComposite(): Promise<CompositeStatus> {
  // Verify that the in-memory egress is still alive
  if (activeEgressId) {
    const alive = await isEgressAlive(activeEgressId);
    if (alive) {
      return {
        active: true,
        egressId: activeEgressId,
        startedAt: activeEgressStartedAt,
      };
    }
    // Egress was aborted/ended without webhook — reset state
    console.log(`[coworking-mcu] Stale egress ${activeEgressId} detected, resetting`);
    activeEgressId = null;
    activeEgressStartedAt = null;
  }

  // Prevent concurrent start calls from spawning multiple egresses
  if (startInProgress) {
    return startInProgress;
  }

  startInProgress = doStartComposite();
  try {
    return await startInProgress;
  } finally {
    startInProgress = null;
  }
}

async function isEgressAlive(egressId: string): Promise<boolean> {
  try {
    const list = await egressClient.listEgress({ egressId });
    if (list.length === 0) return false;
    const egress = list[0];
    if (!egress) return false;
    const status = egress.status;
    // EgressStatus: STARTING=0, ACTIVE=1, ENDING=2 are alive
    return status === 0 || status === 1 || status === 2;
  } catch {
    // If we can't check, assume dead so we can retry
    return false;
  }
}

async function doStartComposite(): Promise<CompositeStatus> {
  // Delete stale HLS files before starting a new composite so that
  // clients won't pick up an old playlist with #EXT-X-ENDLIST
  await cleanupHlsFiles();

  const settings = await getMcuSettings();

  const segmentOutput = new SegmentedFileOutput({
    filenamePrefix: `${EGRESS_HLS_DIR}/segment`,
    playlistName: "playlist.m3u8",
    livePlaylistName: "live.m3u8",
    filenameSuffix: SegmentedFileSuffix.INDEX,
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    segmentDuration: 4,
  });

  const encoding = new EncodingOptions({
    width: settings.width,
    height: settings.height,
    framerate: settings.fps,
    videoCodec: VideoCodec.H264_HIGH,
    videoBitrate: 2000000,
  });

  // Build custom layout URL when a focus identity is configured
  const focusIdentity = settings.focusIdentity;
  let customBaseUrl: string | undefined;
  if (focusIdentity) {
    // Egress runs inside Docker — use host.docker.internal to reach the API on the host
    const apiPort = process.env.PORT || "3001";
    const apiHost = process.env.EGRESS_API_HOST || `host.docker.internal:${apiPort}`;
    customBaseUrl = `http://${apiHost}/api/egress-layout?focusIdentity=${encodeURIComponent(focusIdentity)}`;
    console.log(`[coworking-mcu] Using custom layout: ${customBaseUrl}`);
  }

  // Video only — audio is delivered via WebRTC (lower latency)
  const info = await egressClient.startRoomCompositeEgress(COWORKING_ROOM, segmentOutput, {
    encodingOptions: encoding,
    videoOnly: true,
    ...(customBaseUrl ? { customBaseUrl } : {}),
  });

  activeEgressId = info.egressId;
  activeEgressStartedAt = new Date().toISOString();

  console.log(`[coworking-mcu] Composite started: egressId=${info.egressId}`);

  return {
    active: true,
    egressId: activeEgressId,
    startedAt: activeEgressStartedAt,
  };
}

export async function stopCoworkingComposite(): Promise<void> {
  if (!activeEgressId) {
    return;
  }

  try {
    await egressClient.stopEgress(activeEgressId);
    console.log(`[coworking-mcu] Composite stopped: egressId=${activeEgressId}`);
  } catch (error) {
    console.error(`[coworking-mcu] Error stopping egress ${activeEgressId}:`, error);
  }

  activeEgressId = null;
  activeEgressStartedAt = null;
}

export function getCoworkingCompositeStatus(): CompositeStatus {
  return {
    active: activeEgressId !== null,
    egressId: activeEgressId,
    startedAt: activeEgressStartedAt,
  };
}

export async function ensureCompositeRunning(): Promise<CompositeStatus> {
  // Always go through startCoworkingComposite which verifies egress liveness
  return startCoworkingComposite();
}

export function handleCoworkingEgressEnded(egressId: string): void {
  if (activeEgressId === egressId) {
    console.log(`[coworking-mcu] Egress ended: ${egressId}`);
    activeEgressId = null;
    activeEgressStartedAt = null;

    // Clean up old HLS segment files
    cleanupHlsFiles();
  }
}

async function cleanupHlsFiles(): Promise<void> {
  try {
    const { readdir, unlink } = await import("node:fs/promises");
    const files = await readdir(LOCAL_HLS_DIR);
    let deleted = 0;
    for (const file of files) {
      // Only delete regular HLS files, skip anything suspicious
      if (!/^[a-zA-Z0-9._-]+$/.test(file)) continue;
      try {
        await unlink(path.join(LOCAL_HLS_DIR, file));
        deleted++;
      } catch {
        // ignore individual file errors
      }
    }
    console.log(`[coworking-mcu] Cleaned up ${deleted}/${files.length} HLS files`);
  } catch {
    // directory may not exist
  }
}
