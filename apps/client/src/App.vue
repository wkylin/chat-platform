<template>
  <main class="client-app">
    <section v-if="!user" class="auth-screen">
      <div class="auth-screen__signal" aria-hidden="true">
        <span class="signal-ring signal-ring--one"></span>
        <span class="signal-ring signal-ring--two"></span>
        <span class="signal-core">M</span>
      </div>
      <div class="auth-screen__copy">
        <p class="kicker">{{ copy.privateNetwork }}</p>
        <h1>{{ copy.authTitle }}</h1>
        <p class="lede">{{ copy.authDescription }}</p>
        <div class="auth-screen__facts">
          <span><b>01</b> {{ copy.factTransport }}</span>
          <span><b>02</b> {{ copy.factModerated }}</span>
          <span><b>03</b> {{ copy.factFocused }}</span>
        </div>
      </div>
      <form class="auth-card" @submit.prevent="submitAuth">
        <div class="auth-card__topline">
          <span>{{ authMode === "login" ? copy.welcomeBack : copy.createIdentity }}</span>
          <button type="button" class="text-button" @click="toggleAuthMode">
            {{ authMode === "login" ? copy.register : copy.signIn }}
          </button>
        </div>
        <h2>{{ authMode === "login" ? copy.enterRoom : copy.openChannel }}</h2>
        <p class="auth-card__hint">
          {{ authMode === "login" ? copy.loginHint : copy.registerHint }}
        </p>
        <label>
          {{ copy.username }}
          <input v-model="authForm.username" autocomplete="username" required minlength="3"
            :placeholder="copy.usernamePlaceholder" />
        </label>
        <label v-if="authMode === 'register'">
          {{ copy.displayName }}
          <input v-model="authForm.displayName" autocomplete="nickname" :placeholder="copy.displayNamePlaceholder" />
        </label>
        <label>
          {{ copy.password }}
          <input v-model="authForm.password" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
            type="password" required minlength="8" :placeholder="copy.passwordPlaceholder" />
        </label>
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <button class="primary-button primary-button--wide" type="submit" :disabled="busy">
          {{ busy ? copy.connecting : authMode === "login" ? copy.enterWorkspace : copy.createAccount }}
        </button>
        <div class="mt-4.5 flex items-center justify-between text-xs text-(--muted)"><span>{{ copy.language
        }}</span>
          <Listbox :model-value="locale" @update:model-value="setLocale">
            <div class="relative">
              <ListboxButton
                class="flex min-w-28 items-center justify-between gap-2 rounded-md border border-(--line) bg-[#0e1217] px-2.5 py-2 text-left text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acid)">
                <span>{{ locale === "en" ? "English" : "中文" }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </ListboxButton>
              <ListboxOptions
                class="absolute right-0 z-20 mt-1 w-full overflow-hidden rounded-md border border-(--line-strong) bg-[#171e26] p-1 shadow-xl focus:outline-none">
                <ListboxOption v-for="option in localeOptions" :key="option.value" :value="option.value"
                  v-slot="{ active, selected }" as="template">
                  <li
                    :class="[active ? 'bg-(--acid-dim) text-(--text)' : 'text-(--muted)', 'flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs']">
                    <span>{{ option.label }}</span>
                    <Check v-if="selected" :size="14" class="text-(--acid)" aria-hidden="true" />
                  </li>
                </ListboxOption>
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
        <p class="auth-card__foot">{{ locale === "zh-CN" ? `服务端 API · ${apiOrigin} · 演示账号 guest / guest123!` : `Server API · ${apiOrigin} · Demo account guest / guest123!` }}</p>
      </form>
    </section>

    <section v-else class="workspace">
      <header class="workspace__topbar">
        <div class="brand-lockup"><span class="brand-mark">M</span><span>match<span
              class="brand-lockup__muted">/chat</span></span></div>
        <div class="workspace__transport"><span class="transport-dot" :class="`is-${connectionStatus}`"></span><span>{{
          connectionLabel }}</span><span class="transport-separator">/</span><span>{{ demoMode ? copy.localDemo : copy.xmppTransport }}</span>
        </div>
        <div class="workspace__account"><span class="avatar">{{ initials(user.displayName) }}</span><span>{{
          user.displayName }}</span>
          <Listbox :model-value="locale" @update:model-value="setLocale">
            <div class="relative">
              <ListboxButton :aria-label="copy.language"
                class="flex items-center gap-1 rounded-md border border-(--line) bg-[#0e1217] px-1.5 py-1 text-[11px] text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acid)">
                <span>{{ locale === "en" ? "EN" : "中文" }}</span>
                <ChevronDown :size="12" aria-hidden="true" />
              </ListboxButton>
              <ListboxOptions
                class="absolute right-0 z-20 mt-1 w-24 overflow-hidden rounded-md border border-(--line-strong) bg-[#171e26] p-1 shadow-xl focus:outline-none">
                <ListboxOption v-for="option in localeOptions" :key="option.value" :value="option.value"
                  v-slot="{ active, selected }" as="template">
                  <li
                    :class="[active ? 'bg-(--acid-dim) text-(--text)' : 'text-(--muted)', 'flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs']">
                    <span>{{ option.shortLabel }}</span>
                    <Check v-if="selected" :size="14" class="text-(--acid)" aria-hidden="true" />
                  </li>
                </ListboxOption>
              </ListboxOptions>
            </div>
          </Listbox><button class="text-button" @click="logout">{{ copy.signOut }}</button>
        </div>
      </header>

      <div class="workspace__body">
        <aside class="rooms-rail">
          <div class="rooms-rail__header">
            <div>
              <p class="kicker">{{ copy.yourNetwork }}</p>
              <h2>{{ copy.rooms }}</h2>
            </div><button class="icon-button" :title="copy.createRoom"
              @click="showCreateRoom = !showCreateRoom">+</button>
          </div>
          <form v-if="showCreateRoom" class="create-room" @submit.prevent="createRoom">
            <input v-model="roomForm.name" required maxlength="80" :placeholder="copy.roomName" />
            <input v-model="roomForm.description" maxlength="120" :placeholder="copy.roomPurpose" />
            <button class="primary-button primary-button--small" type="submit" :disabled="busy">{{ copy.createRoom
            }}</button>
          </form>
          <div class="rooms-list">
            <button v-for="room in rooms" :key="room.id" class="room-link"
              :class="{ 'is-selected': selectedRoom?.id === room.id }" @click="selectRoom(room)">
              <span class="room-link__pulse" :class="`is-${room.status}`"></span>
              <span class="room-link__copy"><strong>{{ room.name }}</strong><small>{{ room.memberCount }} {{
                copy.members }} · {{ room.messageCount }} {{ copy.messages }}</small></span>
              <span class="room-link__arrow">↗</span>
            </button>
            <p v-if="!rooms.length" class="rail-empty">{{ copy.noRooms }}</p>
          </div>
          <div class="rooms-rail__note"><span class="note-mark">↯</span>
            <p><strong>{{ copy.liveMeansLive }}</strong><br />{{ copy.liveNote }}</p>
          </div>
        </aside>

        <section class="chat-stage">
          <div v-if="selectedRoom" class="chat-stage__intro">
            <div>
              <p class="kicker">{{ copy.activeRoom }} / {{ selectedRoom.status }}</p>
              <h1>{{ selectedRoom.name }}</h1>
              <p>{{ selectedRoom.description || copy.noDescription }}</p>
            </div>
            <div class="room-code"><span>{{ copy.roomJid }}</span><code>{{ selectedRoom.jid }}</code></div>
          </div>
          <div v-if="selectedRoom" class="chat-stage__panel">
            <ImChatPanel :room-name="selectedRoom.name" :messages="messages" :current-user-id="user.id"
              :member-count="selectedRoom.memberCount" :connection-status="connectionStatus"
              :disabled="selectedRoom.status !== 'active' || connectionStatus !== 'online'" :labels="chatLabels"
              :locale="locale" @send="sendMessage" @report="reportMessage" />
          </div>
          <div v-else class="chat-stage__empty"><span class="empty-orbit">◎</span>
            <h1>{{ copy.chooseRoom }}</h1>
            <p>{{ copy.chooseRoomHint }}</p>
          </div>
        </section>

        <aside class="insight-rail">
          <p class="kicker">{{ copy.roomTelemetry }}</p>
          <h2>{{ copy.stayInSignal }}</h2>
          <div class="telemetry-grid">
            <div><strong>{{ selectedRoom?.memberCount || 0 }}</strong><span>{{ copy.members }}</span></div>
            <div><strong>{{ selectedRoom?.messageCount || 0 }}</strong><span>{{ copy.messages }}</span></div>
          </div>
          <div class="insight-card"><span class="insight-card__label">{{ copy.transport }}</span><strong>{{
            connectionLabel }}</strong>
            <p>{{ copy.transportDescription }}</p>
          </div>
          <div class="insight-card"><span class="insight-card__label">{{ copy.communityNote }}</span>
            <p>{{ copy.reportDescription }}</p><button class="quiet-button" @click="refreshRooms">{{ copy.refreshRooms
            }} ↗</button>
          </div>
          <div class="insight-quote">{{ copy.quote }}</div>
        </aside>
      </div>
      <p v-if="notice" class="workspace__notice" role="status">{{ notice }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/vue";
import { Check, ChevronDown } from "lucide-vue-next";
import { XmppChatClient, type ImChatMessage, type ImChatPanelLabels, type ImRoom, type ImUser, type ImXmppSession, type XmppConnectionStatus } from "@match-chat/im-ui";

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787/api";
const apiOrigin = new URL(apiBase).origin;
const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
type Locale = "en" | "zh-CN";
const locale = ref<Locale>(localStorage.getItem("match-chat-locale") === "zh-CN" ? "zh-CN" : "en");
const localeOptions: { value: Locale; label: string; shortLabel: string }[] = [
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "zh-CN", label: "中文", shortLabel: "中文" },
];
const translations = {
  en: {
    privateNetwork: "MATCH CHAT / PRIVATE NETWORK", authTitle: "Conversations with a pulse.", authDescription: "A focused room for people who need the signal, not the noise.", factTransport: "XMPP live transport", factModerated: "Moderated by design", factFocused: "Rooms that stay focused", welcomeBack: "Welcome back", createIdentity: "Create an identity", register: "Register", signIn: "Sign in", enterRoom: "Enter the room", openChannel: "Open your channel", loginHint: "Your live rooms are waiting.", registerHint: "Your display name is how people will see you.", username: "Username", usernamePlaceholder: "signal-maker", displayName: "Display name", displayNamePlaceholder: "Signal Maker", password: "Password", passwordPlaceholder: "8+ characters", connecting: "Connecting…", enterWorkspace: "Enter workspace", createAccount: "Create account", language: "Language", localDemo: "Local demo", xmppTransport: "xmpp over websocket", signOut: "Sign out", yourNetwork: "Your network", rooms: "Rooms", createRoom: "Create room", roomName: "Room name", roomPurpose: "One-line purpose", members: "members", messages: "messages", noRooms: "No rooms yet. Start one.", liveMeansLive: "Live means live.", liveNote: "Messages travel through an XMPP room, while history and moderation stay on the API.", activeRoom: "Active room", noDescription: "A room without a description yet.", roomJid: "ROOM JID", chooseRoom: "Choose a room.", chooseRoomHint: "Every useful conversation starts with a clear place to have it.", roomTelemetry: "Room telemetry", stayInSignal: "Stay in the signal.", transport: "TRANSPORT", transportDescription: "Each room is joined as an XMPP MUC. If transport drops, the panel stays honest.", communityNote: "COMMUNITY NOTE", reportDescription: "Report a message through the API review queue when a room needs a human decision.", refreshRooms: "Refresh room data", quote: "“A good room is a small instrument. You can hear when it is out of tune.”", reportPrompt: "Why should this message be reviewed?", reportDefault: "Needs moderator review", reportSent: "Report sent to the control room.", demoStatus: "Demo", status: { idle: "Standby", connecting: "Connecting", online: "Live", offline: "Offline", error: "Needs attention" }, panel: { liveThread: "room / live thread", people: "people", emptyTitle: "The room is quiet.", emptyDescription: "Start the thread with a clear signal.", report: "report", removedMessage: "This message was removed by a moderator.", unavailablePlaceholder: "Room is not accepting messages", composerPlaceholder: "Write to the room…", sendHint: "Enter to send · Shift + Enter for a new line", send: "Send signal" },
  },
  "zh-CN": {
    privateNetwork: "MATCH CHAT / 私密网络", authTitle: "让对话保持脉搏。", authDescription: "为重视有效信息、远离噪音的人打造的专注空间。", factTransport: "XMPP 实时传输", factModerated: "内建内容管理", factFocused: "始终专注的房间", welcomeBack: "欢迎回来", createIdentity: "创建身份", register: "注册", signIn: "登录", enterRoom: "进入房间", openChannel: "开启频道", loginHint: "你的实时房间正在等待。", registerHint: "其他人将通过显示名称认识你。", username: "用户名", usernamePlaceholder: "signal-maker", displayName: "显示名称", displayNamePlaceholder: "信号创作者", password: "密码", passwordPlaceholder: "至少 8 个字符", connecting: "正在连接…", enterWorkspace: "进入工作区", createAccount: "创建账号", language: "语言", localDemo: "本地演示", xmppTransport: "XMPP WebSocket 传输", signOut: "退出登录", yourNetwork: "你的网络", rooms: "房间", createRoom: "创建房间", roomName: "房间名称", roomPurpose: "一句话说明", members: "位成员", messages: "条消息", noRooms: "还没有房间，创建一个吧。", liveMeansLive: "实时就是实时。", liveNote: "消息经由 XMPP 房间传输，历史记录和内容管理则保留在 API 中。", activeRoom: "当前房间", noDescription: "该房间暂未添加说明。", roomJid: "房间 JID", chooseRoom: "选择一个房间。", chooseRoomHint: "每一次有价值的对话，都始于一个清晰的交流场所。", roomTelemetry: "房间数据", stayInSignal: "保持专注。", transport: "传输", transportDescription: "每个房间都以 XMPP MUC 加入。传输中断时，面板会如实反映状态。", communityNote: "社区提示", reportDescription: "当房间需要人工判断时，可通过 API 审核队列举报消息。", refreshRooms: "刷新房间数据", quote: "“好的房间像一件小巧的乐器，走音时一听便知。”", reportPrompt: "为什么需要审核此消息？", reportDefault: "需要管理员审核", reportSent: "举报已发送到管理台。", demoStatus: "演示", status: { idle: "待命", connecting: "连接中", online: "在线", offline: "离线", error: "需要处理" }, panel: { liveThread: "房间 / 实时对话", people: "位成员", emptyTitle: "房间里很安静。", emptyDescription: "用一条清晰的消息开启对话。", report: "举报", removedMessage: "此消息已被管理员移除。", unavailablePlaceholder: "房间当前不接受消息", composerPlaceholder: "写点什么…", sendHint: "Enter 发送 · Shift + Enter 换行", send: "发送消息" },
  },
} satisfies Record<Locale, Record<string, unknown>>;
const copy = computed(() => translations[locale.value]);
const chatLabels = computed<ImChatPanelLabels>(() => ({ ...copy.value.panel, status: { ...copy.value.status, online: demoMode ? copy.value.demoStatus : copy.value.status.online } }));
const token = ref(localStorage.getItem("match-chat-token") || "");
const user = ref<ImUser | null>(null);
const rooms = ref<ImRoom[]>([]);
const selectedRoom = ref<ImRoom | null>(null);
const messages = ref<ImChatMessage[]>([]);
const notice = ref("");
const errorMessage = ref("");
const busy = ref(false);
const showCreateRoom = ref(false);
const authMode = ref<"login" | "register">("login");
const authForm = reactive({ username: "guest", displayName: "", password: "guest123!" });
const roomForm = reactive({ name: "", description: "" });
const connectionStatus = ref<XmppConnectionStatus>("offline");
const xmpp = new XmppChatClient({
  onStatus: (status) => (connectionStatus.value = status),
  onMessage: receiveMessage,
  onError: (error) => (notice.value = error.message),
  onReconnect: refreshMessagesAfterReconnect,
});

const connectionLabel = computed(() => copy.value.status[connectionStatus.value]);

function persistLocale(): void { localStorage.setItem("match-chat-locale", locale.value); }
function setLocale(value: Locale): void { locale.value = value; persistLocale(); }

function initials(value: string): string { return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

function openDemoWorkspace(username = "guest"): void {
  user.value = { id: "demo_guest", username, displayName: username === "guest" ? "Guest Member" : username, role: "user", status: "active", createdAt: new Date().toISOString() };
  const room: ImRoom = { id: "demo_room", name: "Signal Commons", description: "A sample room for exploring the Match Chat user experience.", jid: "room-demo@conference.example", status: "active", memberCount: 4, messageCount: 2, createdAt: new Date().toISOString(), ownerId: "demo_admin" };
  rooms.value = [room];
  selectedRoom.value = room;
  messages.value = [
    { id: "demo_message_1", roomId: room.id, userId: "demo_admin", displayName: "Mira Chen", body: "Welcome to the demo room. Try sending a message to see the local mock interaction.", status: "visible", createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { id: "demo_message_2", roomId: room.id, userId: "demo_guest", displayName: "Guest Member", body: "The room is ready. This conversation stays in this browser session.", status: "visible", createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString() },
  ];
  connectionStatus.value = "online";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (token.value) headers.set("authorization", `Bearer ${token.value}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload as T;
}

async function submitAuth(): Promise<void> {
  busy.value = true; errorMessage.value = "";
  try {
    if (demoMode) {
      if (authMode.value !== "login" || authForm.username !== "guest" || authForm.password !== "guest123!") throw new Error("Use the demo account shown below.");
      token.value = "github-pages-demo-user"; localStorage.setItem("match-chat-token", token.value); openDemoWorkspace(); return;
    }
    const result = await request<{ token: string; user: ImUser }>(`/auth/${authMode.value}`, { method: "POST", body: JSON.stringify(authForm) });
    token.value = result.token; user.value = result.user; localStorage.setItem("match-chat-token", result.token);
    await bootWorkspace();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "Unable to continue."; }
  finally { busy.value = false; }
}

function toggleAuthMode(): void { authMode.value = authMode.value === "login" ? "register" : "login"; errorMessage.value = ""; }

async function bootWorkspace(): Promise<void> {
  if (demoMode) { openDemoWorkspace(user.value?.username); return; }
  const result = await request<{ rooms: ImRoom[] }>("/rooms"); rooms.value = result.rooms;
  if (!selectedRoom.value && rooms.value[0]) await selectRoom(rooms.value[0]);
  await connectRealtime();
}

async function connectRealtime(): Promise<void> {
  if (!user.value) return;
  const session = await request<ImXmppSession>("/im/session", { method: "POST" });
  await xmpp.connect(session);
  if (selectedRoom.value) await xmpp.setRoom(selectedRoom.value.jid);
}

async function selectRoom(room: ImRoom): Promise<void> {
  selectedRoom.value = room; messages.value = [];
  if (demoMode) { return; }
  try {
    await request(`/rooms/${room.id}/join`, { method: "POST" });
    const result = await request<{ messages: ImChatMessage[] }>(`/rooms/${room.id}/messages`);
    messages.value = result.messages;
    await xmpp.setRoom(room.jid);
  } catch (error) { notice.value = error instanceof Error ? error.message : "Unable to open room."; }
}

async function createRoom(): Promise<void> {
  if (!roomForm.name.trim()) return;
  busy.value = true;
  try {
    if (demoMode) {
      const room: ImRoom = { id: `demo_${Date.now()}`, name: roomForm.name.trim(), description: roomForm.description.trim(), jid: `room-demo-${Date.now()}@conference.example`, status: "active", memberCount: 1, messageCount: 0, createdAt: new Date().toISOString(), ownerId: user.value?.id || "demo_guest" };
      rooms.value.unshift(room); roomForm.name = ""; roomForm.description = ""; showCreateRoom.value = false; await selectRoom(room); return;
    }
    const result = await request<{ room: ImRoom }>("/rooms", { method: "POST", body: JSON.stringify(roomForm) });
    rooms.value.unshift(result.room); roomForm.name = ""; roomForm.description = ""; showCreateRoom.value = false; await selectRoom(result.room);
  } catch (error) { notice.value = error instanceof Error ? error.message : "Unable to create room."; }
  finally { busy.value = false; }
}

async function sendMessage(body: string): Promise<void> {
  if (demoMode && selectedRoom.value && user.value) {
    messages.value.push({ id: `demo_message_${Date.now()}`, roomId: selectedRoom.value.id, userId: user.value.id, displayName: user.value.displayName, body, status: "visible", createdAt: new Date().toISOString(), mine: true });
    selectedRoom.value.messageCount += 1; return;
  }
  try { await xmpp.send(body); }
  catch (error) { notice.value = error instanceof Error ? error.message : "Message was not sent."; }
}

async function reportMessage(messageId: string): Promise<void> {
  if (!selectedRoom.value) return;
  const reason = window.prompt(copy.value.reportPrompt, copy.value.reportDefault);
  if (!reason?.trim()) return;
  if (demoMode) { notice.value = copy.value.reportSent; return; }
  try {
    await request(`/rooms/${selectedRoom.value.id}/reports`, {
      method: "POST",
      body: JSON.stringify({ messageId, reason: reason.trim() }),
    });
    notice.value = copy.value.reportSent;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : "Unable to send report.";
  }
}

function receiveMessage(message: ImChatMessage): void {
  if (!selectedRoom.value || message.roomId !== selectedRoom.value.id) return;
  if (messages.value.some((item) => item.id === message.id)) return;
  messages.value.push(message); selectedRoom.value.messageCount += 1;
}

async function refreshMessagesAfterReconnect(): Promise<void> {
  if (demoMode || !selectedRoom.value) return;
  const roomId = selectedRoom.value.id;
  try {
    const result = await request<{ messages: ImChatMessage[] }>(`/rooms/${roomId}/messages`);
    if (selectedRoom.value?.id !== roomId) return;
    const unique = new Map<string, ImChatMessage>();
    for (const message of [...result.messages, ...messages.value]) unique.set(message.id, message);
    messages.value = [...unique.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch (error) {
    notice.value = error instanceof Error ? error.message : "Unable to refresh room history.";
  }
}

async function refreshRooms(): Promise<void> { if (demoMode) { notice.value = copy.value.localDemo; return; } const result = await request<{ rooms: ImRoom[] }>("/rooms"); rooms.value = result.rooms; if (selectedRoom.value) selectedRoom.value = rooms.value.find((room) => room.id === selectedRoom.value?.id) || selectedRoom.value; }

async function logout(): Promise<void> { await xmpp.disconnect(); if (!demoMode) { try { await request("/im/session", { method: "DELETE" }); } catch { /* local logout still wins */ } } token.value = ""; user.value = null; selectedRoom.value = null; messages.value = []; localStorage.removeItem("match-chat-token"); }

onMounted(async () => {
  if (!token.value) return;
  if (demoMode) { openDemoWorkspace(); return; }
  try { const me = await request<{ user: ImUser }>("/me"); user.value = me.user; await bootWorkspace(); }
  catch { token.value = ""; localStorage.removeItem("match-chat-token"); }
});
onBeforeUnmount(() => { void xmpp.disconnect(); });
</script>
