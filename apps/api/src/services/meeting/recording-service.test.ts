import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingRecordings } from "../../db/schema.js";

const { dbMock, egressClientMock, getStorageSettingsMock } = vi.hoisted(() => {
  const updateSetWhereMock = vi.fn();
  const queryFindFirstMock = vi.fn();
  const queryFindManyMock = vi.fn();
  return {
    dbMock: {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateSetWhereMock,
        })),
      })),
      query: {
        meetingRecordings: {
          findFirst: queryFindFirstMock,
          findMany: queryFindManyMock,
        },
      },
      _updateSetWhereMock: updateSetWhereMock,
      _queryFindFirstMock: queryFindFirstMock,
      _queryFindManyMock: queryFindManyMock,
    },
    egressClientMock: {
      startTrackCompositeEgress: vi.fn(),
      stopEgress: vi.fn(),
    },
    getStorageSettingsMock: vi.fn(),
  };
});

vi.mock("../../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("livekit-server-sdk", () => {
  class MockEgressClient {
    startTrackCompositeEgress = egressClientMock.startTrackCompositeEgress;
    stopEgress = egressClientMock.stopEgress;
  }
  class MockEncodedFileOutput {
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts);
    }
  }
  return {
    EgressClient: MockEgressClient,
    EncodedFileOutput: MockEncodedFileOutput,
    EncodedFileType: { MP4: 0 },
  };
});

vi.mock("../../lib/livekit-config.js", () => ({
  livekitHost: "http://livekit:7880",
  livekitApiKey: "test-key",
  livekitApiSecret: "test-secret",
}));

vi.mock("../admin/admin-service.js", () => ({
  getStorageSettings: getStorageSettingsMock,
  getEmailSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock("../notification/notification-service.js", () => ({
  notifyRecordingComplete: vi.fn().mockResolvedValue(undefined),
}));

describe("recording-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock.insert.mockClear();
    dbMock.update.mockClear();
    dbMock._updateSetWhereMock.mockReset();
    dbMock._queryFindFirstMock.mockReset();
    dbMock._queryFindManyMock.mockReset();
    egressClientMock.startTrackCompositeEgress.mockReset();
    egressClientMock.stopEgress.mockReset();
    getStorageSettingsMock.mockReset();
  });

  describe("startRecording", () => {
    it("calls EgressClient.startTrackCompositeEgress and inserts a DB record", async () => {
      getStorageSettingsMock.mockResolvedValue({
        provider: "local",
        localPath: "/data/files",
        gcsBucket: null,
        gcsKeyJson: null,
        s3Bucket: null,
        s3AccessKey: null,
        s3SecretKey: null,
        s3Endpoint: null,
        s3Region: null,
      });

      const egressInfo = { egressId: "egress_123" };
      egressClientMock.startTrackCompositeEgress.mockResolvedValue(egressInfo);

      const recordingRow = {
        id: "rec_1",
        meetingId: "meeting_1",
        egressId: "egress_123",
        status: "starting",
        initiatedBy: "user_1",
        contentType: "video/mp4",
      };

      dbMock.insert.mockReturnValue({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [recordingRow]),
        })),
      } as ReturnType<typeof dbMock.insert>);

      vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
        "11111111-1111-1111-1111-111111111111" as `${string}-${string}-${string}-${string}-${string}`
      );

      const { startRecording } = await import("./recording-service.js");
      const result = await startRecording("room-a", "meeting_1", "user_1");

      expect(egressClientMock.startTrackCompositeEgress).toHaveBeenCalledWith(
        "room-a",
        expect.objectContaining({ fileType: 0, filepath: expect.any(String) })
      );
      expect(dbMock.insert).toHaveBeenCalledWith(meetingRecordings);
      expect(result.egressInfo).toEqual(egressInfo);
      expect(result.recording).toEqual(recordingRow);
    });
  });

  describe("stopRecording", () => {
    it("calls EgressClient.stopEgress and updates DB status to stopping", async () => {
      egressClientMock.stopEgress.mockResolvedValue(undefined);
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const { stopRecording } = await import("./recording-service.js");
      await stopRecording("egress_123");

      expect(egressClientMock.stopEgress).toHaveBeenCalledWith("egress_123");
      expect(dbMock.update).toHaveBeenCalledWith(meetingRecordings);
    });
  });

  describe("handleEgressWebhook", () => {
    it("maps status 0 to 'starting'", async () => {
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const setMock = vi.fn(() => ({ where: dbMock._updateSetWhereMock }));
      dbMock.update.mockReturnValue({ set: setMock });

      const { handleEgressWebhook } = await import("./recording-service.js");
      await handleEgressWebhook({
        egressInfo: { egressId: "egress_1", status: 0 },
      });

      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "starting" }));
    });

    it("maps status 1 to 'recording' and sets startedAt", async () => {
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const setMock = vi.fn(() => ({ where: dbMock._updateSetWhereMock }));
      dbMock.update.mockReturnValue({ set: setMock });

      const { handleEgressWebhook } = await import("./recording-service.js");
      await handleEgressWebhook({
        egressInfo: { egressId: "egress_1", status: 1 },
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "recording",
          startedAt: expect.any(Date),
        })
      );
    });

    it("maps status 3 to 'completed' with file results and triggers transcription", async () => {
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const setMock = vi.fn(() => ({ where: dbMock._updateSetWhereMock }));
      dbMock.update.mockReturnValue({ set: setMock });

      dbMock._queryFindFirstMock.mockResolvedValue({
        meetingId: "meeting_1",
        storagePath: "recordings/room-a/12345",
        egressId: "egress_1",
        status: "completed",
      });

      const { handleEgressWebhook } = await import("./recording-service.js");
      await handleEgressWebhook({
        egressInfo: {
          egressId: "egress_1",
          status: 3,
          fileResults: [
            {
              filename: "recordings/room-a/12345",
              size: 1024,
              duration: 60_000_000_000, // 60s in ns
            },
          ],
        },
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          endedAt: expect.any(Date),
          storagePath: "recordings/room-a/12345",
          fileSize: 1024,
          durationMs: 60000,
        })
      );
    });

    it("maps status 4 to 'failed' with error message", async () => {
      dbMock._updateSetWhereMock.mockResolvedValue(undefined);

      const setMock = vi.fn(() => ({ where: dbMock._updateSetWhereMock }));
      dbMock.update.mockReturnValue({ set: setMock });

      const { handleEgressWebhook } = await import("./recording-service.js");
      await handleEgressWebhook({
        egressInfo: {
          egressId: "egress_1",
          status: 4,
          error: "Disk full",
        },
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          endedAt: expect.any(Date),
          errorMessage: "Disk full",
        })
      );
    });

    it("does nothing for unknown status values", async () => {
      const { handleEgressWebhook } = await import("./recording-service.js");
      await handleEgressWebhook({
        egressInfo: { egressId: "egress_1", status: 99 },
      });

      expect(dbMock.update).not.toHaveBeenCalled();
    });

    it("does nothing when egressInfo is undefined", async () => {
      const { handleEgressWebhook } = await import("./recording-service.js");
      await handleEgressWebhook({});

      expect(dbMock.update).not.toHaveBeenCalled();
    });
  });
});
