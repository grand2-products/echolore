"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Room, RoomEvent, ConnectionState } from "livekit-client";
import { useAuthContext } from "@/lib/auth-context";
import { useCoworkingLivekitSettings } from "@/lib/site-settings-context";
import { useT } from "@/lib/i18n";
import { COWORKING_ROOM_NAME, fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";

interface JoinOptions {
  /** Enable camera immediately after joining (default: true) */
  enableCamera?: boolean;
  /** Enable microphone immediately after joining (default: false) */
  enableMic?: boolean;
  /** Preferred video device ID */
  videoDeviceId?: string;
}

interface CoworkingRoomContextValue {
  /** The persistent Room instance, or null if not joined */
  room: Room | null;
  /** Whether the room is currently connected */
  isConnected: boolean;
  /** Join the coworking room (idempotent if already connected) */
  join: (opts?: JoinOptions) => Promise<void>;
  /** Leave the coworking room */
  leave: () => Promise<void>;
}

const CoworkingRoomContext = createContext<CoworkingRoomContextValue>({
  room: null,
  isConnected: false,
  join: async () => {},
  leave: async () => {},
});

export function useCoworkingRoom() {
  return useContext(CoworkingRoomContext);
}

export function CoworkingRoomProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const t = useT();
  const lkSettings = useCoworkingLivekitSettings();
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const joiningRef = useRef(false);

  // Track connection state changes
  useEffect(() => {
    if (!room) return;
    const onStateChange = (state: ConnectionState) => {
      setIsConnected(state === ConnectionState.Connected);
    };
    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
    // Sync initial state
    setIsConnected(room.state === ConnectionState.Connected);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onStateChange);
    };
  }, [room]);

  const isMcu = lkSettings.mode === "mcu";
  const { dynacast, adaptiveStream, simulcast } = lkSettings;

  const join = useCallback(async (opts?: JoinOptions) => {
    const { enableCamera = true, enableMic = false, videoDeviceId } = opts ?? {};

    // Already connected or in progress
    if (roomRef.current?.state === ConnectionState.Connected) return;
    if (joiningRef.current) return;
    joiningRef.current = true;

    try {
      // Disconnect stale room if any
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }

      const participantIdentity =
        user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;

      const token = await fetchLiveKitToken({
        roomName: COWORKING_ROOM_NAME,
        participantName: user?.name ?? t("coworking.guest"),
        participantIdentity,
      });

      const newRoom = new Room({
        dynacast: isMcu ? false : dynacast,
        adaptiveStream: isMcu
          ? false
          : adaptiveStream
            ? { pixelDensity: "screen" }
            : false,
        publishDefaults: isMcu
          ? {
              simulcast: false,
              videoEncoding: { maxBitrate: 150_000, maxFramerate: 10 },
            }
          : { simulcast },
        videoCaptureDefaults: {
          ...(isMcu ? { resolution: { width: 320, height: 240, frameRate: 10 } } : {}),
          ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
        },
      });

      roomRef.current = newRoom;
      setRoom(newRoom);

      await newRoom.connect(getLiveKitUrl(), token);

      // Enable tracks based on options
      if (enableCamera) {
        await newRoom.localParticipant.setCameraEnabled(true);
      }
      if (enableMic) {
        await newRoom.localParticipant.setMicrophoneEnabled(true);
      }
    } catch (err) {
      // Clean up on failure
      if (roomRef.current) {
        await roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
        setRoom(null);
      }
      throw err;
    } finally {
      joiningRef.current = false;
    }
  }, [user?.id, user?.name, t, isMcu, dynacast, adaptiveStream, simulcast]);

  const leave = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      setRoom(null);
      setIsConnected(false);
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  const value = useMemo(
    () => ({ room, isConnected, join, leave }),
    [room, isConnected, join, leave],
  );

  return (
    <CoworkingRoomContext.Provider value={value}>
      {children}
    </CoworkingRoomContext.Provider>
  );
}
