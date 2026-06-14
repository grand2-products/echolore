import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestApp, memberUser } from "../test-utils/index.js";

/**
 * Safety-focused integration tests for the upload route's PNG→WebP path.
 *
 * The compressor itself is exhaustively tested in `lib/image-compress.test.ts`.
 * These tests pin down the *route-level* contracts that protect uploaders
 * from silent breakage:
 *
 *  - The compressor is only invoked for `image/png` AND the cached toggle is on
 *  - Any compressor failure (throw or null) falls back to the original buffer
 *  - Audit metadata records both the original and the stored representation
 *    so an admin can always trace what the user actually uploaded
 */

const {
  saveFileMock,
  buildStoragePathMock,
  createFileMock,
  auditActionMock,
  getImageSettingsMock,
  compressPngToWebpMock,
} = vi.hoisted(() => ({
  saveFileMock: vi.fn(),
  buildStoragePathMock: vi.fn((p: string) => `/tmp/${p}`),
  createFileMock: vi.fn(),
  auditActionMock: vi.fn(),
  getImageSettingsMock: vi.fn(),
  compressPngToWebpMock: vi.fn(),
}));

vi.mock("../lib/file-storage.js", () => ({
  saveFile: saveFileMock,
  buildStoragePath: buildStoragePathMock,
  loadFile: vi.fn(),
  removeFile: vi.fn(),
}));

vi.mock("../repositories/file/file-repository.js", () => ({
  countFiles: vi.fn(),
  countFilesByUploader: vi.fn(),
  createFile: createFileMock,
  deleteFile: vi.fn(),
  getFileById: vi.fn(),
  listFiles: vi.fn(),
  listFilesByUploader: vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({
  auditAction: auditActionMock,
}));

vi.mock("../services/admin/image-settings-service.js", () => ({
  getImageSettings: getImageSettingsMock,
}));

vi.mock("../lib/image-compress.js", () => ({
  compressPngToWebp: compressPngToWebpMock,
}));

// Authorization-policy doesn't matter for /upload but is imported by the
// module; stub it so the import graph resolves.
vi.mock("../policies/authorization-policy.js", () => ({
  authorizeOwnerResource: vi.fn(async () => ({ allowed: true })),
}));

const { filesRoutes } = await import("./files.js");

const app = createTestApp("/files", filesRoutes, memberUser({ role: UserRole.Member }));

function pngLikeBuffer(size: number): Buffer {
  // Real PNG magic header so the compressor's sniff would succeed if called.
  // The contents past the header are zero-filled, which sharp would reject in
  // a real flow — but here the compressor itself is mocked, so it doesn't run.
  const buf = Buffer.alloc(size);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return buf;
}

/** Node's `File` constructor wants `BlobPart`; raw Node `Buffer` isn't one. */
function makeFile(buf: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buf)], name, { type });
}

async function uploadFile(file: File): Promise<Response> {
  const fd = new FormData();
  fd.append("file", file);
  return app.fetch(new Request("http://localhost/files/upload", { method: "POST", body: fd }));
}

describe("POST /files/upload — PNG→WebP safety", () => {
  beforeEach(() => {
    saveFileMock.mockReset();
    createFileMock.mockReset();
    auditActionMock.mockReset();
    getImageSettingsMock.mockReset();
    compressPngToWebpMock.mockReset();

    createFileMock.mockImplementation(async (file) => file);
    auditActionMock.mockResolvedValue(undefined);
    saveFileMock.mockResolvedValue(undefined);
  });

  it("never invokes the compressor when the toggle is OFF, regardless of MIME", async () => {
    getImageSettingsMock.mockResolvedValue({
      pngAutoCompress: false,
      pngCompressThresholdKb: 1024,
    });

    const buf = pngLikeBuffer(2 * 1024 * 1024);
    const res = await uploadFile(makeFile(buf, "shot.png", "image/png"));

    expect(res.status).toBe(201);
    expect(compressPngToWebpMock).not.toHaveBeenCalled();

    // Stored file metadata is the original (.png), not a WebP.
    const stored = createFileMock.mock.calls[0]?.[0];
    expect(stored?.filename).toBe("shot.png");
    expect(stored?.contentType).toBe("image/png");

    // Audit has no compression metadata when no compression happened.
    const auditMeta = auditActionMock.mock.calls[0]?.[4];
    expect(auditMeta).toBeDefined();
    expect(auditMeta).not.toHaveProperty("storedFilename");
    expect(auditMeta).not.toHaveProperty("compression");
  });

  it("never invokes the compressor when MIME is not image/png", async () => {
    getImageSettingsMock.mockResolvedValue({ pngAutoCompress: true, pngCompressThresholdKb: 1024 });

    const buf = Buffer.alloc(2 * 1024 * 1024);
    const res = await uploadFile(makeFile(buf, "doc.pdf", "application/pdf"));

    expect(res.status).toBe(201);
    expect(compressPngToWebpMock).not.toHaveBeenCalled();

    const stored = createFileMock.mock.calls[0]?.[0];
    expect(stored?.filename).toBe("doc.pdf");
    expect(stored?.contentType).toBe("application/pdf");
  });

  it("stores the original when the compressor returns null (e.g. would inflate)", async () => {
    getImageSettingsMock.mockResolvedValue({ pngAutoCompress: true, pngCompressThresholdKb: 1024 });
    compressPngToWebpMock.mockResolvedValue(null);

    const buf = pngLikeBuffer(2 * 1024 * 1024);
    const res = await uploadFile(makeFile(buf, "shot.png", "image/png"));

    expect(res.status).toBe(201);
    expect(compressPngToWebpMock).toHaveBeenCalledOnce();

    const stored = createFileMock.mock.calls[0]?.[0];
    expect(stored?.filename).toBe("shot.png");
    expect(stored?.contentType).toBe("image/png");
    expect(stored?.size).toBe(buf.length);

    // saveFile got the *original* buffer.
    expect(saveFileMock).toHaveBeenCalledOnce();
    const savedBuf = saveFileMock.mock.calls[0]?.[1] as Buffer;
    expect(savedBuf.length).toBe(buf.length);

    // Audit does NOT carry compression metadata.
    const auditMeta = auditActionMock.mock.calls[0]?.[4];
    expect(auditMeta).not.toHaveProperty("compression");
  });

  it("passes the admin-configured threshold to the compressor, converted to bytes", async () => {
    getImageSettingsMock.mockResolvedValue({ pngAutoCompress: true, pngCompressThresholdKb: 500 });
    compressPngToWebpMock.mockResolvedValue(null);

    const buf = pngLikeBuffer(2 * 1024 * 1024);
    const res = await uploadFile(makeFile(buf, "shot.png", "image/png"));

    expect(res.status).toBe(201);
    expect(compressPngToWebpMock).toHaveBeenCalledWith(expect.anything(), "shot.png", 500 * 1024);
  });

  it("stores the original when the compressor throws (does not 5xx the upload)", async () => {
    getImageSettingsMock.mockResolvedValue({ pngAutoCompress: true, pngCompressThresholdKb: 1024 });
    compressPngToWebpMock.mockRejectedValue(new Error("sharp decode failed"));

    // Silence the console.error from the route's catch — it's expected here.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const buf = pngLikeBuffer(2 * 1024 * 1024);
    const res = await uploadFile(makeFile(buf, "broken.png", "image/png"));

    expect(res.status).toBe(201);

    const stored = createFileMock.mock.calls[0]?.[0];
    expect(stored?.filename).toBe("broken.png");
    expect(stored?.contentType).toBe("image/png");

    const auditMeta = auditActionMock.mock.calls[0]?.[4];
    expect(auditMeta).not.toHaveProperty("compression");

    errSpy.mockRestore();
  });

  it("records both original and stored representations in audit on successful compression", async () => {
    getImageSettingsMock.mockResolvedValue({ pngAutoCompress: true, pngCompressThresholdKb: 1024 });
    const webpBuffer = Buffer.alloc(200_000); // smaller than the original
    compressPngToWebpMock.mockResolvedValue({
      buffer: webpBuffer,
      contentType: "image/webp",
      filename: "shot.webp",
    });

    const buf = pngLikeBuffer(2 * 1024 * 1024);
    const res = await uploadFile(makeFile(buf, "shot.png", "image/png"));

    expect(res.status).toBe(201);

    // DB row reflects the *stored* (WebP) file.
    const stored = createFileMock.mock.calls[0]?.[0];
    expect(stored?.filename).toBe("shot.webp");
    expect(stored?.contentType).toBe("image/webp");
    expect(stored?.size).toBe(webpBuffer.length);

    // saveFile got the WebP buffer.
    const savedBuf = saveFileMock.mock.calls[0]?.[1] as Buffer;
    expect(savedBuf.length).toBe(webpBuffer.length);

    // Audit captures BOTH so admins can trace the user's original upload.
    const auditMeta = auditActionMock.mock.calls[0]?.[4];
    expect(auditMeta).toMatchObject({
      filename: "shot.png",
      contentType: "image/png",
      storedFilename: "shot.webp",
      storedContentType: "image/webp",
      compression: "png-to-webp",
    });
    expect(auditMeta?.size).toBe(buf.length);
    expect(auditMeta?.storedSize).toBe(webpBuffer.length);
  });
});
