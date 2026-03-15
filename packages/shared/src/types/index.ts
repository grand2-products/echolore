import type { BlockType, MeetingStatus, UserRole } from "../contracts/index.js";

export type { BlockType, MeetingStatus } from "../contracts/index.js";

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// Wiki types
export interface Page {
  id: string;
  title: string;
  parentId?: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Block {
  id: string;
  pageId: string;
  type: BlockType;
  content?: string;
  properties?: Record<string, unknown>;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// Meeting types
export interface Meeting {
  id: string;
  title: string;
  creatorId: string;
  roomName: string;
  status: MeetingStatus;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

export interface Transcript {
  id: string;
  meetingId: string;
  speakerId?: string;
  content: string;
  timestamp: Date;
  createdAt: Date;
}

export interface Summary {
  id: string;
  meetingId: string;
  content: string;
  createdAt: Date;
}

// File types
export interface File {
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
  gcsPath: string;
  uploaderId: string;
  createdAt: Date;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
