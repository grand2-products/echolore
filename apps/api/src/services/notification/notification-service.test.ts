import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetEmailSettings,
  mockSendMail,
  mockTransportClose,
  mockDbQueryUsersFindFirst,
  mockFetch,
} = vi.hoisted(() => ({
  mockGetEmailSettings: vi.fn(),
  mockSendMail: vi.fn(),
  mockTransportClose: vi.fn(),
  mockDbQueryUsersFindFirst: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../admin/admin-service.js", () => ({
  getEmailSettings: mockGetEmailSettings,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      close: mockTransportClose,
    })),
  },
}));

vi.mock("../../db/index.js", () => ({
  db: {
    query: {
      users: {
        findFirst: (...args: unknown[]) => mockDbQueryUsersFindFirst(...args),
      },
    },
  },
}));

vi.mock("../../db/schema.js", () => ({
  users: { id: "users.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _tag: "eq", a, b })),
}));

// Mock global fetch for Resend API calls
vi.stubGlobal("fetch", mockFetch);

import { notifyRecordingComplete } from "./notification-service.js";

describe("notification-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe("sendEmail via Resend", () => {
    it("sends email using Resend API", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "resend",
        resendApiKey: "re_test_key",
        resendFrom: "noreply@test.com",
        smtpHost: null,
        smtpPort: null,
        smtpSecure: false,
        smtpUser: null,
        smtpPass: null,
        smtpFrom: null,
      });

      mockDbQueryUsersFindFirst.mockResolvedValue({
        id: "user_1",
        email: "user@test.com",
        name: "Alice",
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => '{"id":"email_123"}',
      });

      await notifyRecordingComplete("meeting_1", "Team Standup", "user_1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer re_test_key",
          }),
        })
      );

      const fetchBody = JSON.parse(mockFetch.mock.calls[0]?.[1].body);
      expect(fetchBody.to).toEqual(["user@test.com"]);
      expect(fetchBody.subject).toContain("Recording ready");
      expect(fetchBody.from).toBe("noreply@test.com");
    });

    it("throws when Resend API returns error", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "resend",
        resendApiKey: "re_test_key",
        resendFrom: "noreply@test.com",
        smtpHost: null,
        smtpPort: null,
        smtpSecure: false,
        smtpUser: null,
        smtpPass: null,
        smtpFrom: null,
      });

      mockDbQueryUsersFindFirst.mockResolvedValue({
        id: "user_1",
        email: "user@test.com",
        name: "Alice",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => "Invalid recipient",
      });

      // notifyRecordingComplete catches errors internally, so it should not throw
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await notifyRecordingComplete("meeting_1", "Team Standup", "user_1");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[notification]"),
        expect.any(Error)
      );
    });
  });

  describe("sendEmail via SMTP", () => {
    it("sends email using SMTP transport", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "smtp",
        resendApiKey: null,
        resendFrom: null,
        smtpHost: "smtp.test.com",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "smtp_user",
        smtpPass: "smtp_pass",
        smtpFrom: "noreply@smtp.test.com",
      });

      mockDbQueryUsersFindFirst.mockResolvedValue({
        id: "user_1",
        email: "user@test.com",
        name: "Bob",
      });

      mockSendMail.mockResolvedValue({ messageId: "msg_123" });

      await notifyRecordingComplete("meeting_1", "Sprint Review", "user_1");

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "noreply@smtp.test.com",
          to: "user@test.com",
          subject: expect.stringContaining("Recording ready"),
        })
      );
      expect(mockTransportClose).toHaveBeenCalled();
    });

    it("closes transport even when sendMail fails", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "smtp",
        resendApiKey: null,
        resendFrom: null,
        smtpHost: "smtp.test.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "smtp_user",
        smtpPass: "smtp_pass",
        smtpFrom: "noreply@smtp.test.com",
      });

      mockDbQueryUsersFindFirst.mockResolvedValue({
        id: "user_1",
        email: "user@test.com",
        name: "Bob",
      });

      mockSendMail.mockRejectedValue(new Error("SMTP connection refused"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await notifyRecordingComplete("meeting_1", "Sprint Review", "user_1");

      // Transport should be closed even on failure (finally block)
      expect(mockTransportClose).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("notifyRecordingComplete", () => {
    it("does nothing when provider is none", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "none",
        resendApiKey: null,
        resendFrom: null,
        smtpHost: null,
        smtpPort: null,
        smtpSecure: false,
        smtpUser: null,
        smtpPass: null,
        smtpFrom: null,
      });

      await notifyRecordingComplete("meeting_1", "Test", "user_1");

      expect(mockDbQueryUsersFindFirst).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does nothing when initiatedByUserId is null", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "resend",
        resendApiKey: "key",
        resendFrom: "from@test.com",
        smtpHost: null,
        smtpPort: null,
        smtpSecure: false,
        smtpUser: null,
        smtpPass: null,
        smtpFrom: null,
      });

      await notifyRecordingComplete("meeting_1", "Test", null);

      expect(mockDbQueryUsersFindFirst).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does nothing when user has no email", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "resend",
        resendApiKey: "key",
        resendFrom: "from@test.com",
        smtpHost: null,
        smtpPort: null,
        smtpSecure: false,
        smtpUser: null,
        smtpPass: null,
        smtpFrom: null,
      });

      mockDbQueryUsersFindFirst.mockResolvedValue({
        id: "user_1",
        email: null,
        name: "No Email User",
      });

      await notifyRecordingComplete("meeting_1", "Test", "user_1");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sanitizes meeting title in subject and body", async () => {
      mockGetEmailSettings.mockResolvedValue({
        provider: "resend",
        resendApiKey: "key",
        resendFrom: "from@test.com",
        smtpHost: null,
        smtpPort: null,
        smtpSecure: false,
        smtpUser: null,
        smtpPass: null,
        smtpFrom: null,
      });

      mockDbQueryUsersFindFirst.mockResolvedValue({
        id: "user_1",
        email: "user@test.com",
        name: "Alice",
      });

      mockFetch.mockResolvedValue({ ok: true, text: async () => "{}" });

      await notifyRecordingComplete("meeting_1", "Title\r\nWith\tNewlines", "user_1");

      const fetchBody = JSON.parse(mockFetch.mock.calls[0]?.[1].body);
      // Newlines and tabs should be replaced with spaces
      expect(fetchBody.subject).not.toMatch(/[\r\n\t]/);
    });

    it("catches and logs errors without throwing", async () => {
      mockGetEmailSettings.mockRejectedValue(new Error("DB connection lost"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Should not throw
      await notifyRecordingComplete("meeting_1", "Test", "user_1");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[notification]"),
        expect.any(Error)
      );
    });
  });
});
