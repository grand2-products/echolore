export function buildAutonomousDecisionPrompt(input: {
  agentName: string;
  interventionStyle: string;
  systemPrompt: string;
  recentTranscriptLines: string[];
}): string {
  const transcriptBlock = input.recentTranscriptLines.join("\n");

  return `You are an autonomous meeting assistant named "${input.agentName}".
Your intervention style: ${input.interventionStyle}

Your system prompt:
${input.systemPrompt}

Recent meeting transcript:
${transcriptBlock}

Based on the transcript above, decide whether you should intervene in the conversation right now.

Intervene ONLY when:
- Participants are clearly stuck, confused, or going in circles
- A decision or action item needs to be captured and participants haven't done so
- There is a factual error or misunderstanding that could derail the meeting
- Someone explicitly asked for help or information that you can provide

Do NOT intervene when:
- The conversation is flowing naturally
- Participants are making progress on their discussion
- The topic is social/casual and doesn't need facilitation
- You recently intervened (avoid being repetitive)

Respond with exactly one JSON object (no markdown, no extra text):
{"shouldIntervene": boolean, "reason": string, "suggestedPrompt": string}

If shouldIntervene is false, reason should briefly explain why, and suggestedPrompt should be empty.
If shouldIntervene is true, reason should explain why intervention is needed, and suggestedPrompt should contain the prompt to use for generating the response.`;
}
