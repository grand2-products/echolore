#!/usr/bin/env node
// One-shot generator that re-emits apps/web/lib/i18n/locales/ko.yaml and
// apps/web/lib/i18n/locales/zh-CN.yaml using ja.yaml as the structural
// template, preserving any existing translation values and filling in the
// missing keys from an inline translation table.
//
// Usage: node scripts/dev/generate-i18n-locales.mjs
//
// This script is intentionally not wired into CI — it is a maintenance tool
// invoked when key parity drifts. CI runs check-i18n-key-parity.mjs to enforce
// parity going forward.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const localesDir = path.join(repoRoot, "apps", "web", "lib", "i18n", "locales");

const baseLocale = "ja";
const targets = ["ko", "zh-CN"];

// Translation overrides for the keys that are missing from ko / zh-CN as of
// v0.1.66. Filling in the union of missing keys here once is faster than
// hand-editing two YAML files in lockstep.
//
// Shape: { "dotted.key.path": { ko: "...", "zh-CN": "..." } }
const TRANSLATIONS = {
  // admin.settings.* (GCP)
  "admin.settings.gcpTitle": {
    ko: "GCP 서비스 계정",
    "zh-CN": "GCP 服务账号",
  },
  "admin.settings.gcpDescription": {
    ko: "Google Cloud Storage 등 GCP 서비스에서 사용할 기본 인증 정보입니다. 각 설정에서 개별적으로 재정의할 수 있습니다.",
    "zh-CN": "用于 Google Cloud Storage 等 GCP 服务的默认凭据。可在每个设置中单独覆盖。",
  },
  "admin.settings.gcpProjectId": {
    ko: "프로젝트 ID",
    "zh-CN": "项目 ID",
  },
  "admin.settings.gcpServiceAccountKey": {
    ko: "서비스 계정 키 (JSON)",
    "zh-CN": "服务账号密钥 (JSON)",
  },
  "admin.settings.gcpAdcHint": {
    ko: "설정하지 않으면 서버 환경의 Application Default Credentials (ADC) 를 사용합니다.",
    "zh-CN": "未设置时将使用服务器环境的 Application Default Credentials (ADC)。",
  },
  "admin.settings.gcpTestTitle": {
    ko: "GCP 연결 테스트",
    "zh-CN": "GCP 连接测试",
  },
  "admin.settings.gcpTestTesting": {
    ko: "GCP 서비스 계정 인증을 테스트하는 중...",
    "zh-CN": "正在测试 GCP 服务账号认证...",
  },
  "admin.settings.gcpTestSuccess": {
    ko: "GCP 인증에 성공했습니다.\n프로젝트: {projectId}\n서비스 계정: {clientEmail}",
    "zh-CN": "GCP 认证成功。\n项目：{projectId}\n服务账号：{clientEmail}",
  },
  "admin.settings.gcpTestFail": {
    ko: "GCP 인증에 실패했습니다.",
    "zh-CN": "GCP 认证失败。",
  },

  // admin.settings.* (storageGcs)
  "admin.settings.storageGcsUseDefaults": {
    ko: "기존 GCP 설정을 사용",
    "zh-CN": "使用现有 GCP 凭据",
  },
  "admin.settings.storageGcsUseDefaultsHint": {
    ko: "명시적인 서비스 계정 키 대신 Application Default Credentials (ADC) 로 인증합니다. 비활성화하면 별도의 인증 정보를 지정할 수 있습니다.",
    "zh-CN":
      "使用 Application Default Credentials (ADC) 进行认证，而非显式的服务账号密钥。禁用后可指定单独的凭据。",
  },

  // admin.settings.* (drive)
  "admin.settings.driveTitle": {
    ko: "Google Drive",
    "zh-CN": "Google Drive",
  },
  "admin.settings.driveDescription": {
    ko: "공유 드라이브의 파일을 인덱싱하여 AI 채팅에서 검색할 수 있도록 합니다. GCP 서비스 계정에 드라이브 읽기 권한이 필요합니다.",
    "zh-CN":
      "对共享云端硬盘中的文件建立索引，使其可在 AI 聊天中搜索。需要 GCP 服务账号具备 Drive 读取权限。",
  },
  "admin.settings.driveEnabled": {
    ko: "Google Drive 연동 활성화",
    "zh-CN": "启用 Google Drive 集成",
  },
  "admin.settings.driveEnabledHint": {
    ko: "공유 드라이브 파일을 AI 채팅 검색용으로 인덱싱",
    "zh-CN": "为 AI 聊天搜索对共享云端硬盘文件建立索引",
  },
  "admin.settings.driveSharedDriveIds": {
    ko: "공유 드라이브 ID",
    "zh-CN": "共享云端硬盘 ID",
  },
  "admin.settings.driveSharedDriveIdsHint": {
    ko: "쉼표로 구분. 드라이브 URL 에서 가져오기: drive.google.com/drive/u/0/folders/ID",
    "zh-CN": "以逗号分隔。从云端硬盘 URL 获取：drive.google.com/drive/u/0/folders/ID",
  },
  "admin.settings.driveSyncInterval": {
    ko: "동기화 간격 (분)",
    "zh-CN": "同步间隔（分钟）",
  },
  "admin.settings.driveMaxFileSize": {
    ko: "최대 파일 크기 (MB)",
    "zh-CN": "最大文件大小（MB）",
  },
  "admin.settings.driveIncludeMimeTypes": {
    ko: "포함할 MIME 타입",
    "zh-CN": "包含的 MIME 类型",
  },
  "admin.settings.driveIncludeMimeTypesHint": {
    ko: "쉼표로 구분. 비워두면 기본값이 적용됩니다.",
    "zh-CN": "以逗号分隔。留空时将应用默认值。",
  },
  "admin.settings.driveExcludeFolderIds": {
    ko: "제외할 폴더 ID",
    "zh-CN": "排除的文件夹 ID",
  },
  "admin.settings.driveSyncStatus": {
    ko: "동기화 상태",
    "zh-CN": "同步状态",
  },
  "admin.settings.driveSyncRefresh": {
    ko: "새로고침",
    "zh-CN": "刷新",
  },
  "admin.settings.driveSyncNow": {
    ko: "지금 동기화",
    "zh-CN": "立即同步",
  },
  "admin.settings.driveSyncing": {
    ko: "동기화 중...",
    "zh-CN": "同步中...",
  },
  "admin.settings.driveSyncTotal": {
    ko: "전체",
    "zh-CN": "总计",
  },
  "admin.settings.driveSyncIndexed": {
    ko: "인덱싱 완료",
    "zh-CN": "已索引",
  },
  "admin.settings.driveSyncPending": {
    ko: "대기 중",
    "zh-CN": "等待中",
  },
  "admin.settings.driveSyncError": {
    ko: "오류",
    "zh-CN": "错误",
  },
  "admin.settings.driveSyncSkipped": {
    ko: "건너뜀",
    "zh-CN": "已跳过",
  },
  "admin.settings.driveSyncLastSync": {
    ko: "마지막 동기화: {time}",
    "zh-CN": "上次同步：{time}",
  },
  "admin.settings.driveSyncLastResult": {
    ko: "마지막 결과: {indexed}건 인덱싱, {skipped}건 건너뜀, {errors}건 오류",
    "zh-CN": "上次结果：已索引 {indexed} 项，跳过 {skipped} 项，错误 {errors} 项",
  },

  // admin.settings.* (github)
  "admin.settings.githubTitle": {
    ko: "GitHub 저장소",
    "zh-CN": "GitHub 仓库",
  },
  "admin.settings.githubDescription": {
    ko: "GitHub 저장소의 Markdown 파일을 인덱싱하여 AI 채팅에서 검색할 수 있도록 합니다. Contents・Metadata 권한을 가진 GitHub App 이 필요합니다.",
    "zh-CN":
      "对 GitHub 仓库中的 Markdown 文件建立索引，使其可在 AI 聊天中搜索。需要具备 Contents 与 Metadata 权限的 GitHub App。",
  },
  "admin.settings.githubEnabled": {
    ko: "GitHub 연동 활성화",
    "zh-CN": "启用 GitHub 集成",
  },
  "admin.settings.githubEnabledHint": {
    ko: "GitHub 저장소의 문서를 AI 채팅에서 검색 가능하게 합니다",
    "zh-CN": "使 GitHub 仓库中的文档可在 AI 聊天中搜索",
  },
  "admin.settings.githubAppId": {
    ko: "GitHub App ID",
    "zh-CN": "GitHub App ID",
  },
  "admin.settings.githubAppPrivateKey": {
    ko: "GitHub App 개인 키 (PEM)",
    "zh-CN": "GitHub App 私钥 (PEM)",
  },
  "admin.settings.githubWebhookSecret": {
    ko: "Webhook Secret",
    "zh-CN": "Webhook Secret",
  },
  "admin.settings.githubSyncInterval": {
    ko: "동기화 간격 (분)",
    "zh-CN": "同步间隔（分钟）",
  },
  "admin.settings.githubMaxFileSize": {
    ko: "최대 파일 크기 (MB)",
    "zh-CN": "最大文件大小（MB）",
  },
  "admin.settings.githubTestConnection": {
    ko: "연결 테스트",
    "zh-CN": "连接测试",
  },
  "admin.settings.githubRepos": {
    ko: "저장소",
    "zh-CN": "仓库",
  },
  "admin.settings.githubAddRepo": {
    ko: "저장소 추가",
    "zh-CN": "添加仓库",
  },
  "admin.settings.githubAddRepoConfirm": {
    ko: "추가",
    "zh-CN": "添加",
  },
  "admin.settings.githubNoRepos": {
    ko: "등록된 저장소가 없습니다. 저장소를 추가하여 인덱싱을 시작하세요.",
    "zh-CN": "尚未注册仓库。请添加仓库以开始索引。",
  },
  "admin.settings.githubSync": {
    ko: "동기화",
    "zh-CN": "同步",
  },
  "admin.settings.githubDeleteRepo": {
    ko: "삭제",
    "zh-CN": "删除",
  },
  "admin.settings.githubDeleteRepoConfirm": {
    ko: "이 저장소와 모든 인덱스 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    "zh-CN": "确定删除该仓库及其全部索引数据吗？此操作无法撤销。",
  },
  "admin.settings.githubReindexAll": {
    ko: "전체 재인덱싱",
    "zh-CN": "全部重新索引",
  },
  "admin.settings.githubLoading": {
    ko: "불러오는 중...",
    "zh-CN": "加载中...",
  },
  "admin.settings.githubFetchRepos": {
    ko: "저장소 가져오기",
    "zh-CN": "获取仓库",
  },
  "admin.settings.githubSelectRepo": {
    ko: "저장소 선택...",
    "zh-CN": "选择仓库...",
  },
  "admin.settings.githubLogs": {
    ko: "로그",
    "zh-CN": "日志",
  },
  "admin.settings.githubSyncHistory": {
    ko: "동기화 이력",
    "zh-CN": "同步历史",
  },
  "admin.settings.githubNoSyncLogs": {
    ko: "아직 동기화 로그가 없습니다",
    "zh-CN": "暂无同步日志",
  },

  // aituber.*
  "aituber.title": {
    ko: "AITuber",
    "zh-CN": "AITuber",
  },
  "aituber.description": {
    ko: "AI 캐릭터가 시청자의 메시지에 실시간으로 응답하는 방송 모드입니다.",
    "zh-CN": "AI 角色实时回应观众消息的直播模式。",
  },

  // aituber.characters.*
  "aituber.characters.title": { ko: "캐릭터 관리", "zh-CN": "角色管理" },
  "aituber.characters.create": { ko: "캐릭터 만들기", "zh-CN": "创建角色" },
  "aituber.characters.edit": { ko: "캐릭터 편집", "zh-CN": "编辑角色" },
  "aituber.characters.name": { ko: "이름", "zh-CN": "名称" },
  "aituber.characters.personality": { ko: "성격", "zh-CN": "性格" },
  "aituber.characters.systemPrompt": { ko: "시스템 프롬프트", "zh-CN": "系统提示词" },
  "aituber.characters.speakingStyle": { ko: "말투", "zh-CN": "说话方式" },
  "aituber.characters.languageCode": { ko: "언어 코드", "zh-CN": "语言代码" },
  "aituber.characters.voiceName": { ko: "음성", "zh-CN": "语音" },
  "aituber.characters.voiceDefault": { ko: "기본값 (자동 선택)", "zh-CN": "默认（自动选择）" },
  "aituber.characters.avatarFile": { ko: "아바타 VRM 파일", "zh-CN": "Avatar VRM 文件" },
  "aituber.characters.avatarDropzone": {
    ko: "여기에 VRM 파일을 드롭하거나 클릭하여 선택",
    "zh-CN": "将 VRM 文件拖到此处，或点击选择",
  },
  "aituber.characters.avatarUploadHint": {
    ko: "VRM 형식 (.vrm) / 최대 50MB",
    "zh-CN": "VRM 格式（.vrm） / 最大 50MB",
  },
  "aituber.characters.avatarPreview": { ko: "현재 아바타", "zh-CN": "当前 Avatar" },
  "aituber.characters.avatarDownload": { ko: "VRM 열기", "zh-CN": "打开 VRM" },
  "aituber.characters.isPublic": { ko: "공개", "zh-CN": "公开" },
  "aituber.characters.save": { ko: "저장", "zh-CN": "保存" },
  "aituber.characters.saving": { ko: "저장 중...", "zh-CN": "保存中..." },
  "aituber.characters.delete": { ko: "삭제", "zh-CN": "删除" },
  "aituber.characters.deleteConfirm": {
    ko: "이 캐릭터를 삭제하시겠습니까?",
    "zh-CN": "确定删除该角色吗？",
  },
  "aituber.characters.created": { ko: "캐릭터를 생성했습니다.", "zh-CN": "已创建角色。" },
  "aituber.characters.updated": { ko: "캐릭터를 업데이트했습니다.", "zh-CN": "已更新角色。" },
  "aituber.characters.deleted": { ko: "캐릭터를 삭제했습니다.", "zh-CN": "已删除角色。" },
  "aituber.characters.empty": { ko: "아직 캐릭터가 없습니다.", "zh-CN": "尚无角色。" },
  "aituber.characters.loadError": {
    ko: "캐릭터를 불러오지 못했습니다.",
    "zh-CN": "加载角色失败。",
  },
  "aituber.characters.saveError": {
    ko: "캐릭터 저장에 실패했습니다.",
    "zh-CN": "保存角色失败。",
  },
  "aituber.characters.fileTooLarge": {
    ko: "파일 크기가 50MB 를 초과합니다.",
    "zh-CN": "文件大小超过 50MB。",
  },
  "aituber.characters.invalidVrmExtension": {
    ko: ".vrm 확장자 파일만 업로드할 수 있습니다.",
    "zh-CN": "只能上传 .vrm 扩展名的文件。",
  },
  "aituber.characters.invalidVrmFormat": {
    ko: "유효한 VRM 파일이 아닙니다.",
    "zh-CN": "不是有效的 VRM 文件。",
  },
  "aituber.characters.avatarValidating": {
    ko: "VRM 파일을 검증하는 중...",
    "zh-CN": "正在校验 VRM 文件...",
  },
  "aituber.characters.rebuildCollision": {
    ko: "콜리전 재생성",
    "zh-CN": "重建碰撞体",
  },
  "aituber.characters.rebuildingCollision": { ko: "재생성 중...", "zh-CN": "重建中..." },
  "aituber.characters.collisionRebuilt": {
    ko: "콜리전 프로파일을 재생성했습니다. 저장해 주세요.",
    "zh-CN": "已重建碰撞体配置，请保存以应用。",
  },
  "aituber.characters.collisionRebuildError": {
    ko: "콜리전 프로파일 재생성에 실패했습니다.",
    "zh-CN": "重建碰撞体配置失败。",
  },
  "aituber.characters.deleteError": {
    ko: "캐릭터 삭제에 실패했습니다.",
    "zh-CN": "删除角色失败。",
  },

  // aituber.characters.tooltips.*
  "aituber.characters.tooltips.name": {
    ko: "방송 중에 표시되는 캐릭터의 이름입니다.",
    "zh-CN": "直播中显示的角色名称。",
  },
  "aituber.characters.tooltips.personality": {
    ko: "캐릭터의 성격이나 특징을 자연어로 작성합니다. AI 응답 스타일에 영향을 줍니다.",
    "zh-CN": "用自然语言描述角色的性格与特征，会影响 AI 的应答风格。",
  },
  "aituber.characters.tooltips.systemPrompt": {
    ko: "AI 에 제공할 시스템 프롬프트입니다. 응답 규칙, 제약, 캐릭터 설정의 세부 내용을 작성하세요.",
    "zh-CN": "提供给 AI 的系统提示词。请在此填写应答规则、约束以及角色设定的详细内容。",
  },
  "aituber.characters.tooltips.speakingStyle": {
    ko: '말투의 특징입니다. 예: "존댓말을 사용", "사투리 사용", "문장 끝에 ~냥 붙이기"',
    "zh-CN": '说话方式的特征。例如："使用敬语"、"使用方言"、"句尾加上~喵"',
  },
  "aituber.characters.tooltips.languageCode": {
    ko: "음성 합성에 사용할 언어 코드입니다. 선택한 언어에 해당하는 음성이 표시됩니다.",
    "zh-CN": "用于语音合成的语言代码。将显示所选语言对应的语音。",
  },
  "aituber.characters.tooltips.voiceName": {
    ko: "음성 합성에 사용할 보이스입니다. 먼저 언어 코드를 선택하세요.",
    "zh-CN": "用于语音合成的声音。请先选择语言代码。",
  },
  "aituber.characters.tooltips.avatarFile": {
    ko: "3D 아바타용 VRM 파일 (최대 50MB) 을 업로드합니다. 방송 화면에 표시됩니다.",
    "zh-CN": "上传用于 3D Avatar 的 VRM 文件（最大 50MB），将显示在直播画面上。",
  },
  "aituber.characters.tooltips.isPublic": {
    ko: "활성화하면 다른 사용자도 이 캐릭터를 사용할 수 있습니다.",
    "zh-CN": "启用后，其他用户也可以使用该角色。",
  },

  // aituber.characters.preview.*
  "aituber.characters.preview.title": { ko: "미리보기", "zh-CN": "预览" },
  "aituber.characters.preview.ttsLabel": { ko: "음성 테스트", "zh-CN": "语音测试" },
  "aituber.characters.preview.ttsPlaceholder": {
    ko: "테스트할 텍스트를 입력...",
    "zh-CN": "输入用于测试的文本...",
  },
  "aituber.characters.preview.speak": { ko: "재생", "zh-CN": "播放" },
  "aituber.characters.preview.synthesizing": { ko: "합성 중...", "zh-CN": "合成中..." },
  "aituber.characters.preview.ttsError": {
    ko: "음성 합성에 실패했습니다.",
    "zh-CN": "语音合成失败。",
  },
  "aituber.characters.preview.motions": { ko: "모션", "zh-CN": "动作" },
  "aituber.characters.preview.allCategories": { ko: "전체", "zh-CN": "全部" },
  "aituber.characters.preview.emotions": { ko: "표정", "zh-CN": "表情" },

  // aituber.preview.*
  "aituber.preview.panelExpression": { ko: "표정", "zh-CN": "表情" },
  "aituber.preview.panelPose": { ko: "포즈", "zh-CN": "姿势" },
  "aituber.preview.panelMotion": { ko: "모션", "zh-CN": "动作" },
  "aituber.preview.allCategories": { ko: "전체", "zh-CN": "全部" },
  "aituber.preview.selectMotion": { ko: "-- 모션 --", "zh-CN": "-- 动作 --" },
  "aituber.preview.pose.rest": { ko: "기본", "zh-CN": "Rest" },
  "aituber.preview.pose.tpose": { ko: "T-포즈", "zh-CN": "T-Pose" },
  "aituber.preview.emotions.neutral": { ko: "중립", "zh-CN": "中性" },
  "aituber.preview.emotions.happy": { ko: "기쁨", "zh-CN": "高兴" },
  "aituber.preview.emotions.sad": { ko: "슬픔", "zh-CN": "悲伤" },
  "aituber.preview.emotions.angry": { ko: "화남", "zh-CN": "愤怒" },
  "aituber.preview.emotions.surprised": { ko: "놀람", "zh-CN": "惊讶" },
  "aituber.preview.emotions.relaxed": { ko: "편안함", "zh-CN": "放松" },
  "aituber.preview.motionCategories.greeting": { ko: "인사", "zh-CN": "问候" },
  "aituber.preview.motionCategories.nod": { ko: "끄덕임", "zh-CN": "点头" },
  "aituber.preview.motionCategories.laugh": { ko: "웃음", "zh-CN": "大笑" },
  "aituber.preview.motionCategories.surprise": { ko: "놀람", "zh-CN": "惊讶" },
  "aituber.preview.motionCategories.sad": { ko: "슬픔", "zh-CN": "悲伤" },
  "aituber.preview.motionCategories.angry": { ko: "화남", "zh-CN": "愤怒" },
  "aituber.preview.motionCategories.think": { ko: "생각", "zh-CN": "思考" },
  "aituber.preview.motionCategories.explain": { ko: "설명", "zh-CN": "讲解" },
  "aituber.preview.motionCategories.reaction": { ko: "리액션", "zh-CN": "反应" },
  "aituber.preview.motionCategories.idle": { ko: "대기", "zh-CN": "待机" },

  // aituber.sessions.*
  "aituber.sessions.title": { ko: "세션", "zh-CN": "会话" },
  "aituber.sessions.create": { ko: "세션 만들기", "zh-CN": "创建会话" },
  "aituber.sessions.selectCharacter": { ko: "캐릭터 선택", "zh-CN": "选择角色" },
  "aituber.sessions.sessionTitle": { ko: "제목", "zh-CN": "标题" },
  "aituber.sessions.titlePlaceholder": {
    ko: "방송 제목을 입력",
    "zh-CN": "输入直播标题",
  },
  "aituber.sessions.start": { ko: "방송 시작", "zh-CN": "开始直播" },
  "aituber.sessions.stop": { ko: "방송 종료", "zh-CN": "停止直播" },
  "aituber.sessions.watch": { ko: "시청하기", "zh-CN": "观看" },
  "aituber.sessions.created": { ko: "세션을 생성했습니다.", "zh-CN": "已创建会话。" },
  "aituber.sessions.started": { ko: "방송을 시작했습니다.", "zh-CN": "已开始直播。" },
  "aituber.sessions.stopped": { ko: "방송을 종료했습니다.", "zh-CN": "已结束直播。" },
  "aituber.sessions.createError": {
    ko: "세션 생성에 실패했습니다.",
    "zh-CN": "创建会话失败。",
  },
  "aituber.sessions.startError": {
    ko: "방송 시작에 실패했습니다.",
    "zh-CN": "开始直播失败。",
  },
  "aituber.sessions.stopError": {
    ko: "방송 종료에 실패했습니다.",
    "zh-CN": "停止直播失败。",
  },
  "aituber.sessions.loadError": {
    ko: "세션을 불러오지 못했습니다.",
    "zh-CN": "加载会话失败。",
  },
  "aituber.sessions.empty": { ko: "아직 세션이 없습니다.", "zh-CN": "尚无会话。" },
  "aituber.sessions.startLive": { ko: "방송 시작", "zh-CN": "开始直播" },
  "aituber.sessions.noLiveStream": {
    ko: "현재 방송 중인 스트림이 없습니다.",
    "zh-CN": "当前没有正在直播的流。",
  },
  "aituber.sessions.status.created": { ko: "준비 중", "zh-CN": "准备中" },
  "aituber.sessions.status.live": { ko: "방송 중", "zh-CN": "直播中" },
  "aituber.sessions.status.ended": { ko: "종료", "zh-CN": "已结束" },

  // aituber.viewer.*
  "aituber.viewer.messagePlaceholder": {
    ko: "메시지를 입력...",
    "zh-CN": "输入消息...",
  },
  "aituber.viewer.send": { ko: "보내기", "zh-CN": "发送" },
  "aituber.viewer.sendError": {
    ko: "메시지 전송에 실패했습니다.",
    "zh-CN": "发送消息失败。",
  },
  "aituber.viewer.connecting": { ko: "연결 중...", "zh-CN": "连接中..." },
  "aituber.viewer.disconnected": { ko: "연결이 끊겼습니다", "zh-CN": "已断开连接" },
  "aituber.viewer.viewers": { ko: "시청자: {count}", "zh-CN": "观众：{count}" },
  "aituber.viewer.sessionAborted": {
    ko: "세션이 오류로 종료되었습니다",
    "zh-CN": "会话因错误已结束",
  },
  "aituber.viewer.toolCall.wikiSearch": {
    ko: "Wiki 를 검색하는 중...",
    "zh-CN": "正在搜索 Wiki...",
  },
  "aituber.viewer.toolCall.wikiListPages": {
    ko: "Wiki 페이지 목록을 보는 중...",
    "zh-CN": "正在浏览 Wiki 页面...",
  },
  "aituber.viewer.toolCall.wikiReadPage": {
    ko: "Wiki 페이지를 읽는 중...",
    "zh-CN": "正在读取 Wiki 页面...",
  },
  "aituber.viewer.toolCall.driveSearch": {
    ko: "드라이브를 검색하는 중...",
    "zh-CN": "正在搜索云端硬盘...",
  },
  "aituber.viewer.toolCall.driveRead": {
    ko: "드라이브 파일을 읽는 중...",
    "zh-CN": "正在读取云端硬盘文件...",
  },
  "aituber.viewer.toolCall.generic": { ko: "생각하는 중...", "zh-CN": "思考中..." },

  // aituber.avatar.*
  "aituber.avatar.loading": { ko: "아바타를 불러오는 중...", "zh-CN": "正在加载 Avatar..." },
  "aituber.avatar.loadError": {
    ko: "아바타를 불러오지 못했습니다.",
    "zh-CN": "加载 Avatar 失败。",
  },

  // wiki.shorthand.*
  "wiki.shorthand.placeholder": {
    ko: "메모를 입력하면 AI 가 적절한 위치에 삽입합니다...",
    "zh-CN": "输入备忘，AI 将插入到合适的位置...",
  },
  "wiki.shorthand.error": {
    ko: "속기 처리에 실패하여 마지막에 추가했습니다.",
    "zh-CN": "速记处理失败，已追加到末尾。",
  },

  // meetings.room.leaveSuccess (newly added to ja for parity with en)
  "meetings.room.leaveSuccess": {
    ko: "도우미가 방을 나갔습니다.",
    "zh-CN": "助手已离开房间。",
  },
};

function loadYaml(file) {
  const raw = fs.readFileSync(file, "utf8");
  const data = yaml.load(raw);
  if (data === null || typeof data !== "object") {
    throw new Error(`${file} did not parse to an object`);
  }
  return data;
}

/**
 * Read a dotted key path from a nested object, or undefined.
 */
function readPath(obj, dottedPath) {
  const parts = dottedPath.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Build an output dictionary that follows the shape of `baseDict` but each
 * leaf is filled with the corresponding value from `targetDict`, falling
 * back to TRANSLATIONS[dottedPath][locale], and finally to baseDict's value
 * as a last resort.
 */
function buildLocale(baseDict, targetDict, locale, dottedPath = "") {
  if (baseDict === null || typeof baseDict !== "object" || Array.isArray(baseDict)) {
    // Leaf node — look up best translation.
    const fromTarget = dottedPath ? readPath(targetDict, dottedPath) : undefined;
    if (typeof fromTarget === "string") return fromTarget;
    const fromTable = TRANSLATIONS[dottedPath]?.[locale];
    if (typeof fromTable === "string") return fromTable;
    return baseDict;
  }

  const out = {};
  for (const [k, v] of Object.entries(baseDict)) {
    const next = dottedPath ? `${dottedPath}.${k}` : k;
    out[k] = buildLocale(v, targetDict, locale, next);
  }
  return out;
}

function dumpYaml(data) {
  return yaml.dump(data, {
    lineWidth: -1, // no wrapping (preserve long strings on one line)
    quotingType: '"',
    forceQuotes: true,
    noRefs: true,
  });
}

const ja = loadYaml(path.join(localesDir, `${baseLocale}.yaml`));

for (const locale of targets) {
  const file = path.join(localesDir, `${locale}.yaml`);
  const existing = loadYaml(file);
  const merged = buildLocale(ja, existing, locale);
  const yamlText = dumpYaml(merged);
  fs.writeFileSync(file, yamlText, "utf8");
  process.stdout.write(`Wrote ${path.relative(repoRoot, file).replaceAll("\\", "/")}\n`);
}
