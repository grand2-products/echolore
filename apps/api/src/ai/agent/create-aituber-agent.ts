import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

export interface CreateAituberAgentInput {
  chatModel: BaseChatModel;
  tools: DynamicStructuredTool[];
  /** Compact context fragments injected ahead of tool advertisements. */
  ragContext?: string;
  /** Character persona — name / personality / speaking style / system prompt. */
  character: {
    name: string;
    personality: string;
    systemPrompt: string;
    speakingStyle?: string | null;
  };
  /**
   * Listing of valid `[action:ID]` tags, one `category: id1, id2, ...` per line.
   * Empty string when the motion manifest hasn't loaded — emotion tags are
   * still emitted, but action tags are suppressed.
   */
  actionListing: string;
}

/**
 * AITuber-specific ReAct agent.
 *
 * Differences from `createAiChatAgent`:
 *   - System prompt drives a character persona (not a generic assistant) and
 *     constrains responses to 1-3 sentences with `[emotion:...]`/`[action:...]`
 *     annotation tags.
 *   - Tools are expected to be **viewer-scoped** (see `aituber-ai-service`).
 *     The agent never reaches outside the viewer's permission boundary.
 *   - Markdown output is discouraged — viewers receive the text via TTS, so
 *     punctuation and prose matter more than formatting.
 */
export function createAituberAgent(
  input: CreateAituberAgentInput
): ReturnType<typeof createReactAgent> {
  const contextBlock = input.ragContext
    ? ["", "## 参考情報（社内Wiki・共有ドライブ）", "", input.ragContext, "", "---", ""].join("\n")
    : "";

  const actionBlock = input.actionListing
    ? [
        "",
        "## 利用可能なジェスチャー",
        "応答にジェスチャーが自然な場合、emotionタグの後に [action:ACTION_ID] を付与してください。",
        input.actionListing,
        "アクションが不要な場合はタグを省略。同じアクションが連続しないようバリエーションを使い分けて。",
        "",
      ].join("\n")
    : "";

  const systemMessage = [
    input.character.systemPrompt,
    "",
    `キャラクター名: ${input.character.name}`,
    `性格: ${input.character.personality}`,
    input.character.speakingStyle ? `話し方: ${input.character.speakingStyle}` : "",
    "",
    "視聴者からのメッセージに対して、キャラクターとして自然に応答してください。",
    "応答は簡潔にし、1-3文程度で返してください。",
    "",
    "【重要】応答の先頭に必ず [emotion:TYPE:INTENSITY] を付与してください。",
    "TYPE: neutral, happy, sad, angry, surprised, relaxed のいずれか",
    "INTENSITY: 0.0〜1.0 の小数（感情の強さ）",
    actionBlock,
    "例: [emotion:happy:0.7][action:greeting-wave-casual] やっほー！元気？",
    "例: [emotion:neutral:0.0][action:nod-gentle-1] うん、そうだね。",
    "例: [emotion:sad:0.4] それは残念だね...",
    "",
    "## ツールの使い方",
    "- Wiki: 視聴者の質問に答えるために必要なら、wiki_search で社内ドキュメントを探してください。",
    "  検索結果のスニペットでは足りない場合のみ wiki_read_page で全文を取得。",
    "  「最近の記事は？」「何が書いてある？」のような探索系には wiki_list_pages。",
    "- Drive: 社内 Google Drive にも資料がある可能性があれば drive_search、",
    "  詳細が必要なら drive_read。 (Drive 未連携の場合はツールが提供されません)",
    "- 会議: 「最近の会議は？」には lookup_recent_meetings で視聴者の会議一覧を取得し、",
    "  特定の会議の内容を聞かれたら lookup_meeting_transcript (meetingId) で文字起こしを参照。",
    "  視聴者本人がアクセスできる会議のみ読めます。",
    "- ツール検索の結果はあなた（AIキャラクター）が読み、その内容を参考にキャラクターとして簡潔に話してください。",
    "- ツールが返す本文をそのまま読み上げないでください — マークダウンも貼り付けないでください。",
    "- 視聴者が read 権限を持つコンテンツしか検索できません。見つからない場合は素直にそう伝えてください。",
    contextBlock,
  ]
    .filter(Boolean)
    .join("\n");

  return createReactAgent({
    llm: input.chatModel,
    tools: input.tools,
    prompt: systemMessage,
  });
}
