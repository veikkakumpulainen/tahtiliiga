import assert from "node:assert/strict";
import { webhookContractTests } from "./contract.ts";
import { call, loadFunction, profile, pushes, pushesByToken, resetFakes, token } from "./harness.ts";

const FUNCTION = "notify-admin-message";
const CONVERSATION = "conversation-1";

webhookContractTests(FUNCTION, "admin_messages", { id: "m1", conversation_id: CONVERSATION, user_id: "admin-anna", message: "Hei" });

// Admins Anna and Aki, players Pekka and Pia, all in one conversation.
function conversationFakes(extra: { notification_preferences?: Record<string, unknown>[]; muted_conversations?: Record<string, unknown>[] } = {}) {
  resetFakes({
    tables: {
      profiles: [
        profile("admin-anna", "Anna", "Admin", "admin"),
        profile("admin-aki", "Aki", "Admin", "admin"),
        profile("player-pekka", "Pekka", "Pelaaja"),
        profile("player-pia", "Pia", "Pelaaja"),
      ],
      admin_conversation_members: ["admin-anna", "admin-aki", "player-pekka", "player-pia"].map((user_id) => ({ conversation_id: CONVERSATION, user_id })),
      push_tokens: [token("admin-anna"), token("admin-aki"), token("player-pekka"), token("player-pia")],
      notification_preferences: extra.notification_preferences ?? [],
      muted_conversations: extra.muted_conversations ?? [],
    },
  });
}

const insert = (user_id: string, message = "Tervetuloa liigaan!") => ({ type: "INSERT", table: "admin_messages", record: { id: "message-1", conversation_id: CONVERSATION, user_id, message } });

Deno.test(`${FUNCTION}: players see an admin's message as just "Ylläpito", other admins see the name`, async () => {
  conversationFakes();
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert("admin-anna"));

  assert.deepEqual(result.body, { sent: 3 });
  const byToken = pushesByToken();
  assert.equal(byToken["ExponentPushToken[admin-anna]"], undefined, "the sender gets nothing");
  assert.equal(byToken["ExponentPushToken[player-pekka]"].title, "Ylläpito");
  assert.equal(byToken["ExponentPushToken[player-pia]"].title, "Ylläpito");
  assert.equal(byToken["ExponentPushToken[admin-aki]"].title, "Anna Admin · Ylläpito");
  for (const message of pushes) {
    assert.ok(!message.title.includes("Anna") || message.to === "ExponentPushToken[admin-aki]", `admin name leaked to ${message.to}`);
    assert.equal(message.body, "Tervetuloa liigaan!");
    assert.deepEqual(message.data, { path: `/chat?adminChatId=${CONVERSATION}`, messageId: "message-1" });
  }
});

Deno.test(`${FUNCTION}: a player's reply shows the player's name to everyone`, async () => {
  conversationFakes();
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert("player-pekka", "Kiitos!"));

  assert.deepEqual(result.body, { sent: 3 });
  assert.deepEqual(pushes.map((message) => message.title), ["Pekka Pelaaja · Yksityisviesti", "Pekka Pelaaja · Yksityisviesti", "Pekka Pelaaja · Yksityisviesti"]);
  assert.equal(pushesByToken()["ExponentPushToken[player-pekka]"], undefined);
});

Deno.test(`${FUNCTION}: skips everyone who muted the thread, all notifications, or chat messages`, async () => {
  conversationFakes({
    muted_conversations: [{ user_id: "player-pekka", thread_type: "admin", thread_id: CONVERSATION }, { user_id: "player-pia", thread_type: "admin", thread_id: "another-conversation" }],
    notification_preferences: [{ user_id: "admin-aki", muted_all: true, direct_messages: true }],
  });
  const handler = await loadFunction(FUNCTION);

  await call(handler, insert("admin-anna"));
  assert.deepEqual(pushes.map((message) => message.to), ["ExponentPushToken[player-pia]"]);

  conversationFakes({ notification_preferences: [{ user_id: "player-pia", muted_all: false, direct_messages: false }] });
  await call(handler, insert("admin-anna"));
  assert.deepEqual(pushes.map((message) => message.to).sort(), ["ExponentPushToken[admin-aki]", "ExponentPushToken[player-pekka]"]);
});

Deno.test(`${FUNCTION}: long messages are cut to 120 characters`, async () => {
  conversationFakes();
  const handler = await loadFunction(FUNCTION);

  await call(handler, insert("admin-anna", "x".repeat(200)));

  assert.equal(pushes[0].body, `${"x".repeat(117)}...`);
});
