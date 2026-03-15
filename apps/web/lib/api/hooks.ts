import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "./auth";
import { calendarApi } from "./calendar";
import { meetingsApi } from "./meetings";
import { queryKeys } from "./query-keys";
import type { AiChatConversation, AiChatMessage } from "./types";
import { aiChatApi, wikiApi } from "./wiki";

export function useAuthMeQuery() {
  return useQuery({
    queryKey: queryKeys.authMe,
    queryFn: () => authApi.me(),
    retry: false,
  });
}

export function useMeetingsQuery() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: () => meetingsApi.list(),
  });
}

export function useCreateMeetingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meetingsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
    },
  });
}

export function useSpacesQuery() {
  return useQuery({
    queryKey: queryKeys.wikiSpaces,
    queryFn: () => wikiApi.listSpaces(),
  });
}

export function useWikiPagesQuery() {
  return useQuery({
    queryKey: queryKeys.wikiPages,
    queryFn: () => wikiApi.listPages(),
  });
}

export function useWikiPageQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.wikiPage(id),
    queryFn: () => wikiApi.getPage(id),
    enabled: Boolean(id),
  });
}

export function useAiChatConversationsQuery(opts?: { mine?: boolean; query?: string }) {
  return useQuery({
    queryKey: [...queryKeys.aiChatConversations, opts],
    queryFn: () => aiChatApi.listConversations(opts),
  });
}

export function useAiChatConversationQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.aiChatConversation(id),
    queryFn: () => aiChatApi.getConversation(id),
    enabled: Boolean(id),
  });
}

export function useCreateAiChatConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiChatApi.createConversation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiChatConversations });
    },
  });
}

export function useCalendarStatusQuery(enabled = true) {
  return useQuery({
    queryKey: ["calendar", "status"] as const,
    queryFn: () => calendarApi.status(),
    enabled,
  });
}

export function useCalendarEventsQuery(days?: number, enabled = true) {
  return useQuery({
    queryKey: ["calendar", "events", days] as const,
    queryFn: () => calendarApi.listEvents(days),
    enabled,
  });
}

export function useSendAiChatMessageMutation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => aiChatApi.sendMessage(conversationId, content),
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.aiChatConversation(conversationId),
      });
      const previous = queryClient.getQueryData<{
        conversation: AiChatConversation;
        messages: AiChatMessage[];
      }>(queryKeys.aiChatConversation(conversationId));
      if (previous) {
        const optimisticMessage: AiChatMessage = {
          id: `optimistic-${crypto.randomUUID()}`,
          conversationId,
          role: "user",
          content,
          citations: null,
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData(queryKeys.aiChatConversation(conversationId), {
          ...previous,
          messages: [...previous.messages, optimisticMessage],
        });
      }
      return { previous };
    },
    onError: (_err, _content, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.aiChatConversation(conversationId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.aiChatConversation(conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiChatConversations });
    },
  });
}
