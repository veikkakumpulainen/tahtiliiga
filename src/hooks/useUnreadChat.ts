import { useChatNotify } from "../context/ChatNotifyContext";

export function useUnreadChat() {
  const { unreadGroupIds, unreadLeagueIds, unreadQualificationMatchIds, unreadDirectIds } = useChatNotify();
  return unreadGroupIds.size > 0 || unreadLeagueIds.size > 0 || unreadQualificationMatchIds.size > 0 || unreadDirectIds.size > 0;
}
