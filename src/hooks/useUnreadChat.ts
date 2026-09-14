import { useChatNotify } from "../context/ChatNotifyContext";

export function useUnreadChat() {
  const { unreadGroupIds, unreadLeagueIds } = useChatNotify();
  return unreadGroupIds.size > 0 || unreadLeagueIds.size > 0;
}
