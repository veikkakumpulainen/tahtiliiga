import assert from "node:assert/strict";
import { webhookContractTests } from "./contract.ts";
import { call, loadFunction, profile, pushes, resetFakes, token } from "./harness.ts";

const FUNCTION = "notify-direct-message";
const CONVERSATION = "direct-1";

webhookContractTests(FUNCTION, "direct_messages", { id: "m1", conversation_id: CONVERSATION, user_id: "captain-a", message: "Hei" });

function fakes(participants: unknown[], extra: { muted_conversations?: Record<string, unknown>[] } = {}) {
  resetFakes({
    tables: {
      profiles: [profile("captain-a", "Kalle", "Kapteeni"), profile("captain-b", "Kerttu", "Kapteeni"), profile("player-b", "Ville", "Pelaaja")],
      push_tokens: [token("captain-a"), token("captain-b"), token("player-b")],
      notification_preferences: [],
      muted_conversations: extra.muted_conversations ?? [],
    },
    rpc: {
      direct_conversation_participants: (args) => args.target_conversation_id === CONVERSATION ? participants : [],
    },
  });
}

const insert = (user_id: string) => ({ type: "INSERT", table: "direct_messages", record: { id: "message-1", conversation_id: CONVERSATION, user_id, message: "Pelataanko tiistaina?" } });

Deno.test(`${FUNCTION}: notifies the other participants, not the sender`, async () => {
  fakes(["captain-a", "captain-b", "player-b"]);
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert("captain-a"));

  assert.deepEqual(result.body, { sent: 2 });
  assert.deepEqual(pushes.map((message) => message.to).sort(), ["ExponentPushToken[captain-b]", "ExponentPushToken[player-b]"]);
  for (const message of pushes) {
    assert.equal(message.title, "Kalle Kapteeni · Yksityisviesti");
    assert.equal(message.body, "Pelataanko tiistaina?");
    assert.deepEqual(message.data, { path: `/chat?directId=${CONVERSATION}`, messageId: "message-1" });
  }
});

Deno.test(`${FUNCTION}: reads participants returned as objects too`, async () => {
  fakes([{ direct_conversation_participants: "captain-a" }, { direct_conversation_participants: "captain-b" }]);
  const handler = await loadFunction(FUNCTION);

  await call(handler, insert("captain-a"));

  assert.deepEqual(pushes.map((message) => message.to), ["ExponentPushToken[captain-b]"]);
});

Deno.test(`${FUNCTION}: skips a participant who muted the conversation`, async () => {
  fakes(["captain-a", "captain-b", "player-b"], { muted_conversations: [{ user_id: "player-b", thread_type: "direct", thread_id: CONVERSATION }] });
  const handler = await loadFunction(FUNCTION);

  await call(handler, insert("captain-a"));

  assert.deepEqual(pushes.map((message) => message.to), ["ExponentPushToken[captain-b]"]);
});
