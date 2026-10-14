<template>
  <main class="admin-app">
    <section v-if="!admin" class="admin-login">
      <div class="admin-login__signal"><span>CTRL</span><b>ROOM</b></div>
      <p class="kicker">{{ copy.operations }}</p>
      <h1>{{ copy.loginTitle }}<br /><em>{{ copy.loginTitleEmphasis }}</em></h1>
      <p class="admin-login__lede">{{ copy.loginDescription }}</p>
      <form class="login-panel" @submit.prevent="login">
        <label>{{ copy.operatorId }}<input v-model="form.username" autocomplete="username" required
            placeholder="admin" /></label>
        <label>{{ copy.passcode }}<input v-model="form.password" type="password" autocomplete="current-password"
            required placeholder="••••••••" /></label>
        <p class="demo-login-note">{{ adminCredentialHint }}</p>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <button class="action-button action-button--wide" type="submit" :disabled="busy">{{ loginButtonLabel }}</button>
        <div class="mt-4.5 flex items-center justify-between text-xs text-(--muted)"><span>{{ copy.language
            }}</span>
          <Listbox :model-value="locale" @update:model-value="setLocale">
            <div class="relative">
              <ListboxButton
                class="flex min-w-28 items-center justify-between gap-2 rounded-md border border-(--line) bg-[#10131b] px-2.5 py-2 text-left text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acid)">
                <span>{{ locale === "en" ? "English" : "中文" }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </ListboxButton>
              <ListboxOptions
                class="absolute right-0 z-20 mt-1 w-full overflow-hidden rounded-md border border-(--line) bg-[#1c202c] p-1 shadow-xl focus:outline-none">
                <ListboxOption v-for="option in localeOptions" :key="option.value" :value="option.value"
                  v-slot="{ active, selected }" as="template">
                  <li
                    :class="[active ? 'bg-[rgba(213,239,102,.12)] text-(--text)' : 'text-(--muted)', 'flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs']">
                    <span>{{ option.label }}</span>
                    <Check v-if="selected" :size="14" class="text-(--acid)" aria-hidden="true" />
                  </li>
                </ListboxOption>
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      </form>
    </section>

    <section v-else class="control-room">
      <aside class="control-nav">
        <div class="control-brand"><span>MC</span>
          <div><strong>match/chat</strong><small>{{ copy.controlRoom }}</small></div>
        </div>
        <div class="control-nav__section"><span class="nav-label">{{ copy.observe }}</span><button
            :class="{ active: tab === 'overview' }" @click="tab = 'overview'"><i>◌</i>{{ copy.overview
            }}</button><button :class="{ active: tab === 'rooms' }" @click="tab = 'rooms'"><i>▦</i>{{ copy.rooms
            }}</button></div>
        <div class="control-nav__section"><span class="nav-label">{{ copy.intervene }}</span><button
            :class="{ active: tab === 'reports' }" @click="tab = 'reports'"><i>!</i>{{ copy.reviewQueue }} <b
              v-if="overview?.openReports">{{ overview.openReports }}</b></button><button
            :class="{ active: tab === 'users' }" @click="tab = 'users'"><i>◉</i>{{ copy.members }}</button></div>
        <div class="control-nav__footer"><span class="operator-dot"></span>
          <div><strong>{{ admin.displayName }}</strong><small>{{ copy.administrator }}</small></div><button
            class="signout" @click="logout">↗</button>
        </div>
      </aside>

      <section class="control-content">
        <header class="control-header">
          <div>
            <p class="kicker">{{ tabCopy.eyebrow }}</p>
            <h1>{{ tabCopy.title }}</h1>
            <p>{{ tabCopy.description }}</p>
          </div>
          <div class="header-actions"><span class="last-sync">{{ copy.lastSync }} {{ lastSync }}</span>
            <Listbox :model-value="locale" @update:model-value="setLocale">
              <div class="relative">
                <ListboxButton :aria-label="copy.language"
                  class="flex items-center gap-1 rounded-md border border-(--line) bg-[#1c202c] px-1.5 py-1 text-[11px] text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acid)">
                  <span>{{ locale === "en" ? "EN" : "中文" }}</span>
                  <ChevronDown :size="12" aria-hidden="true" />
                </ListboxButton>
                <ListboxOptions
                  class="absolute right-0 z-20 mt-1 w-24 overflow-hidden rounded-md border border-(--line) bg-[#1c202c] p-1 shadow-xl focus:outline-none">
                  <ListboxOption v-for="option in localeOptions" :key="option.value" :value="option.value"
                    v-slot="{ active, selected }" as="template">
                    <li
                      :class="[active ? 'bg-[rgba(213,239,102,.12)] text-(--text)' : 'text-(--muted)', 'flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs']">
                      <span>{{ option.shortLabel }}</span>
                      <Check v-if="selected" :size="14" class="text-(--acid)" aria-hidden="true" />
                    </li>
                  </ListboxOption>
                </ListboxOptions>
              </div>
            </Listbox><button class="action-button action-button--quiet" @click="loadAll">{{ copy.refreshData
              }}</button>
          </div>
        </header>

        <div v-if="tab === 'overview'" class="overview-view">
          <div class="metric-grid">
            <article v-for="metric in metrics" :key="metric.label" class="metric-card"
              :class="`metric-card--${metric.tone}`"><span>{{ metric.label }}</span><strong>{{ metric.value
              }}</strong><small>{{ metric.detail }}</small>
              <div class="metric-card__line"><i :style="{ width: `${metric.progress}%` }"></i></div>
            </article>
          </div>
          <div class="overview-grid">
            <section class="data-panel">
              <div class="data-panel__header">
                <div><span class="section-index">01</span>
                  <div>
                    <h2>{{ copy.liveRooms }}</h2>
                    <p>{{ copy.liveRoomsDescription }}</p>
                  </div>
                </div><button class="link-button" @click="tab = 'rooms'">{{ copy.viewAll }} ↗</button>
              </div>
              <div class="room-snapshot">
                <div v-for="room in rooms.slice(0, 4)" :key="room.id" class="snapshot-row"><span class="room-status"
                    :class="`is-${room.status}`"></span><strong>{{ room.name }}</strong><span>{{ room.memberCount }}
                    {{ copy.members }}</span><b>{{ room.messageCount }}</b></div>
                <p v-if="!rooms.length" class="empty-copy">{{ copy.noRooms }}</p>
              </div>
            </section>
            <section class="data-panel">
              <div class="data-panel__header">
                <div><span class="section-index">02</span>
                  <div>
                    <h2>{{ copy.reviewQueue }}</h2>
                    <p>{{ copy.reviewQueueDescription }}</p>
                  </div>
                </div><button class="link-button" @click="tab = 'reports'">{{ copy.openQueue }} ↗</button>
              </div>
              <div class="report-snapshot">
                <div v-for="report in reports.filter((item) => item.status === 'open').slice(0, 3)" :key="report.id"
                  class="report-row"><span class="report-severity">!</span>
                  <div><strong>{{ report.reason }}</strong><small>{{ report.reporterName }} · {{
                    shortDate(report.createdAt) }}</small></div><span class="row-arrow">→</span>
                </div>
                <p v-if="!reports.some((item) => item.status === 'open')" class="empty-copy">{{ copy.queueClear }}</p>
              </div>
            </section>
          </div>
          <section class="activity-strip">
            <div><span class="section-index">03</span>
              <h2>{{ copy.systemPosture }}</h2>
            </div>
            <div class="posture"><span class="posture-dot"></span><strong>{{ copy.healthy }}</strong><span>REST API ·
                SQLite · XMPP
                gateway</span></div>
            <div class="posture-copy">{{ copy.postureDescription }}</div>
          </section>
        </div>

        <div v-else-if="tab === 'rooms'" class="table-panel">
          <div class="table-toolbar">
            <div>
              <h2>{{ copy.roomDirectory }}</h2>
              <p>{{ rooms.length }} {{ copy.roomsInNetwork }}</p>
            </div><button class="action-button" @click="tab = 'overview'">{{ copy.backToOverview }}</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ copy.room }}</th>
                  <th>{{ copy.status }}</th>
                  <th>{{ copy.members }}</th>
                  <th>{{ copy.messages }}</th>
                  <th>{{ copy.created }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="room in rooms" :key="room.id">
                  <td><strong>{{ room.name }}</strong><small>{{ room.description || copy.noDescription }}</small></td>
                  <td><span class="status-pill" :class="`is-${room.status}`">{{ room.status }}</span></td>
                  <td>{{ room.memberCount }}</td>
                  <td>{{ room.messageCount }}</td>
                  <td>{{ shortDate(room.createdAt) }}</td>
                  <td>
                    <Listbox :model-value="room.status" @update:model-value="changeRoomStatus(room, $event)">
                      <div class="relative inline-block">
                        <ListboxButton
                          class="flex min-w-20 items-center justify-between gap-1 rounded-md border border-(--line) bg-(--panel-2) px-2 py-1.5 text-[11px] text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--acid)">
                          <span>{{ room.status }}</span>
                          <ChevronDown :size="12" aria-hidden="true" />
                        </ListboxButton>
                        <ListboxOptions
                          class="absolute right-0 z-20 mt-1 w-24 overflow-hidden rounded-md border border-(--line) bg-(--panel-2) p-1 shadow-xl focus:outline-none">
                          <ListboxOption v-for="status in roomStatusOptions" :key="status" :value="status"
                            v-slot="{ active, selected }" as="template">
                            <li
                              :class="[active ? 'bg-[rgba(213,239,102,.12)] text-(--text)' : 'text-(--muted)', 'flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-[11px]']">
                              <span>{{ status }}</span>
                              <Check v-if="selected" :size="12" class="text-(--acid)" aria-hidden="true" />
                            </li>
                          </ListboxOption>
                        </ListboxOptions>
                      </div>
                    </Listbox>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!rooms.length" class="empty-copy">{{ copy.noRoomsFound }}</p>
          </div>
        </div>

        <div v-else-if="tab === 'reports'" class="table-panel">
          <div class="table-toolbar">
            <div>
              <h2>{{ copy.moderationQueue }}</h2>
              <p>{{ copy.moderationDescription }}</p>
            </div>
            <div class="filter-tabs"><button :class="{ active: reportFilter === 'open' }"
                @click="reportFilter = 'open'">{{ copy.open }}</button><button
                :class="{ active: reportFilter === 'all' }" @click="reportFilter = 'all'">{{ copy.all }}</button></div>
          </div>
          <div class="review-list">
            <article v-for="report in visibleReports" :key="report.id" class="review-card"
              :class="{ 'is-resolved': report.status !== 'open' }">
              <div class="review-card__flag">!</div>
              <div class="review-card__main">
                <div class="review-card__meta"><span>{{ report.reason }}</span><time>{{ shortDate(report.createdAt)
                }}</time><b :class="`is-${report.status}`">{{ report.status }}</b></div>
                <blockquote>“{{ report.messageBody }}”</blockquote>
                <p>{{ copy.reportedBy }} <strong>{{ report.reporterName }}</strong> {{ copy.inRoom }} <strong>{{
                  roomName(report.roomId)
                    }}</strong></p>
                <div v-if="report.note" class="review-note">{{ report.note }}</div>
              </div>
              <div v-if="report.status === 'open'" class="review-card__actions"><button
                  @click="reviewReport(report, 'dismissed')">{{ copy.dismiss }}</button><button class="danger-button"
                  @click="removeMessage(report)">{{ copy.removeMessage }}</button><button
                  class="action-button action-button--small" @click="reviewReport(report, 'reviewed')">{{ copy.resolve
                  }}</button>
              </div>
            </article>
            <p v-if="!visibleReports.length" class="empty-state">{{ copy.noReports }}</p>
          </div>
        </div>

        <div v-else class="table-panel">
          <div class="table-toolbar">
            <div>
              <h2>{{ copy.memberDirectory }}</h2>
              <p>{{ copy.memberDirectoryDescription }}</p>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ copy.member }}</th>
                  <th>{{ copy.role }}</th>
                  <th>{{ copy.status }}</th>
                  <th>{{ copy.joined }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="member in members" :key="member.id">
                  <td><strong>{{ member.displayName }}</strong><small>@{{ member.username }}</small></td>
                  <td><span class="role-label">{{ member.role }}</span></td>
                  <td><span class="status-pill" :class="`is-${member.status}`">{{ member.status }}</span></td>
                  <td>{{ shortDate(member.createdAt) }}</td>
                  <td><button class="link-button" :disabled="member.id === admin?.id"
                      :title="member.id === admin?.id ? copy.cannotChangeOwnAccess : undefined"
                      @click="changeMemberStatus(member)">{{ member.status === 'active' ? copy.suspend : copy.restore
                      }}</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-if="notice" class="admin-notice" role="status">{{ notice }}</p>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/vue";
import { Check, ChevronDown } from "lucide-vue-next";
import type { ImRoom, ImUser } from "@match-chat/im-ui";

interface Overview { totalUsers: number; activeUsers: number; activeRooms: number; messagesToday: number; openReports: number; }
interface Report { id: string; messageId: string; roomId: string; reporterId: string; reporterName: string; messageBody: string; reason: string; status: "open" | "reviewed" | "dismissed"; note: string; createdAt: string; reviewedAt: string | null; }
const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787/api";
const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
type Locale = "en" | "zh-CN";
const locale = ref<Locale>(localStorage.getItem("match-chat-locale") === "zh-CN" ? "zh-CN" : "en");
const localeOptions: { value: Locale; label: string; shortLabel: string }[] = [
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "zh-CN", label: "中文", shortLabel: "中文" },
];
const roomStatusOptions = ["active", "paused", "closed"] as const;
const translations = {
  en: {
    operations: "MATCH CHAT / OPERATIONS", loginTitle: "Keep the room", loginTitleEmphasis: "worth entering.", loginDescription: "Moderation is not a back office afterthought. It is how a live room earns trust.", operatorId: "Operator ID", passcode: "Passcode", demoCredentialHint: "Demo account: admin · password: admin123!", localCredentialHint: "Local account: admin · password: admin123!", serverCredentialHint: "Administrator: admin · password is configured as IM_ADMIN_PASSWORD on Vercel.", openingControlRoom: "Opening control room…", openControlRoom: "Open control room", language: "Language", controlRoom: "control room", observe: "Observe", intervene: "Intervene", overview: "Overview", rooms: "Rooms", reviewQueue: "Review queue", members: "Members", administrator: "administrator", lastSync: "last sync", refreshData: "Refresh data", liveRooms: "Live rooms", liveRoomsDescription: "Where the conversation is moving right now.", viewAll: "View all", noRooms: "No rooms have been created yet.", reviewQueueDescription: "Reports that still need a human decision.", openQueue: "Open queue", queueClear: "The queue is clear.", systemPosture: "System posture", healthy: "Healthy", postureDescription: "Realtime transport is intentionally separate from moderation data. A room can stay readable while an operator resolves a report.", roomDirectory: "Room directory", roomsInNetwork: "rooms in the network", backToOverview: "Back to overview", room: "Room", status: "Status", messages: "Messages", created: "Created", noDescription: "No description", noRoomsFound: "No rooms found.", moderationQueue: "Moderation queue", moderationDescription: "Review context, then make the smallest useful decision.", open: "Open", all: "All", reportedBy: "Reported by", inRoom: "in", dismiss: "Dismiss", removeMessage: "Remove message", resolve: "Resolve", noReports: "No reports in this view.", memberDirectory: "Member directory", memberDirectoryDescription: "Account access and room participation.", member: "Member", role: "Role", joined: "Joined", suspend: "Suspend", restore: "Restore", cannotChangeOwnAccess: "You cannot change your own access.", activeMembers: "Active members", registered: "registered", messagesToday: "Messages today", acrossAllRooms: "across all rooms", openReports: "Open reports", needsDecision: "needs a decision", queueIsClear: "queue is clear", roomUpdated: "Room {name} is now {status}.", reportResolved: "Report resolved.", reportDismissed: "Report dismissed.", messageRemoved: "Message removed and report resolved.", unknownRoom: "Unknown room", loginAdminOnly: "This account is not an administrator.", loginFailed: "Unable to open control room.",
  },
  "zh-CN": {
    operations: "MATCH CHAT / 运营管理", loginTitle: "让每个房间", loginTitleEmphasis: "都值得进入。", loginDescription: "内容管理不是事后的后台工作，而是实时房间赢得信任的方式。", operatorId: "管理员账号", passcode: "密码", demoCredentialHint: "演示账号：admin · 密码：admin123!", localCredentialHint: "本地账号：admin · 密码：admin123!", serverCredentialHint: "管理员账号：admin · 密码由 Vercel 的 IM_ADMIN_PASSWORD 配置", openingControlRoom: "正在打开管理台…", openControlRoom: "进入管理台", language: "语言", controlRoom: "管理台", observe: "观察", intervene: "处理", overview: "概览", rooms: "房间", reviewQueue: "审核队列", members: "成员", administrator: "管理员", lastSync: "最近同步", refreshData: "刷新数据", liveRooms: "活跃房间", liveRoomsDescription: "正在进行对话的房间。", viewAll: "查看全部", noRooms: "暂未创建房间。", reviewQueueDescription: "仍需要人工处理的举报。", openQueue: "打开队列", queueClear: "队列已清空。", systemPosture: "系统状态", healthy: "运行正常", postureDescription: "实时传输与审核数据保持独立。管理员处理举报时，房间依然可供阅读。", roomDirectory: "房间目录", roomsInNetwork: "个网络房间", backToOverview: "返回概览", room: "房间", status: "状态", messages: "消息", created: "创建时间", noDescription: "暂无说明", noRoomsFound: "未找到房间。", moderationQueue: "审核队列", moderationDescription: "结合上下文，做出最小且有效的处理。", open: "待处理", all: "全部", reportedBy: "举报人", inRoom: "所在房间", dismiss: "忽略", removeMessage: "移除消息", resolve: "处理完成", noReports: "当前视图没有举报。", memberDirectory: "成员目录", memberDirectoryDescription: "管理账号访问权限和房间参与情况。", member: "成员", role: "角色", joined: "加入时间", suspend: "停用", restore: "恢复", cannotChangeOwnAccess: "不能修改自己的访问权限。", activeMembers: "活跃成员", registered: "已注册", messagesToday: "今日消息", acrossAllRooms: "所有房间", openReports: "待处理举报", needsDecision: "需要处理", queueIsClear: "队列已清空", roomUpdated: "房间 {name} 已更新为 {status}。", reportResolved: "举报已处理。", reportDismissed: "举报已忽略。", messageRemoved: "消息已移除，举报已处理。", unknownRoom: "未知房间", loginAdminOnly: "此账号不是管理员。", loginFailed: "无法打开管理台。",
  },
} satisfies Record<Locale, Record<string, string>>;
const copy = computed(() => translations[locale.value]);
const adminCredentialHint = computed(() => demoMode ? copy.value.demoCredentialHint : import.meta.env.PROD ? copy.value.serverCredentialHint : copy.value.localCredentialHint);
const token = ref(localStorage.getItem("match-chat-admin-token") || "");
const admin = ref<ImUser | null>(null);
const overview = ref<Overview | null>(null);
const rooms = ref<ImRoom[]>([]);
const reports = ref<Report[]>([]);
const members = ref<ImUser[]>([]);
const tab = ref<"overview" | "rooms" | "reports" | "users">("overview");
const reportFilter = ref<"open" | "all">("open");
const form = ref({ username: "admin", password: "" });
const busy = ref(false); const errorMessage = ref(""); const notice = ref(""); const lastSync = ref("—");
const loginButtonLabel = computed(() => busy.value ? copy.value.openingControlRoom : copy.value.openControlRoom);
const demoAdmin: ImUser = { id: "demo_admin", username: "admin", displayName: "Control Room", role: "admin", status: "active", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 28).toISOString() };
const demoRooms = ref<ImRoom[]>([
  { id: "demo_room_1", name: "Signal Commons", description: "A focused room for live conversation.", jid: "room-demo-1@conference.example", status: "active", memberCount: 18, messageCount: 142, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(), ownerId: demoAdmin.id },
  { id: "demo_room_2", name: "Product Studio", description: "Share ideas and review early product concepts.", jid: "room-demo-2@conference.example", status: "paused", memberCount: 7, messageCount: 36, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(), ownerId: demoAdmin.id },
]);
const demoReports = ref<Report[]>([
  { id: "demo_report_1", messageId: "demo_message_3", roomId: "demo_room_1", reporterId: "demo_member_1", reporterName: "Mira Chen", messageBody: "Join my channel for guaranteed investment returns.", reason: "Promotional spam", status: "open", note: "", createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(), reviewedAt: null },
  { id: "demo_report_2", messageId: "demo_message_4", roomId: "demo_room_2", reporterId: "demo_member_2", reporterName: "Theo Park", messageBody: "This message includes personal contact details.", reason: "Personal information", status: "open", note: "", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), reviewedAt: null },
  { id: "demo_report_3", messageId: "demo_message_5", roomId: "demo_room_1", reporterId: "demo_member_3", reporterName: "Ari Morgan", messageBody: "Can someone share the meeting notes?", reason: "Possible off-topic message", status: "dismissed", note: "Kept after review.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(), reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString() },
]);
const demoMembers = ref<ImUser[]>([
  demoAdmin,
  { id: "demo_member_1", username: "mira", displayName: "Mira Chen", role: "user", status: "active", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 16).toISOString() },
  { id: "demo_member_2", username: "theo", displayName: "Theo Park", role: "user", status: "active", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 11).toISOString() },
  { id: "demo_member_3", username: "ari", displayName: "Ari Morgan", role: "user", status: "suspended", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString() },
]);
const demoOverview = ref<Overview>({ totalUsers: 4, activeUsers: 3, activeRooms: 1, messagesToday: 18, openReports: 2 });

function persistLocale(): void { localStorage.setItem("match-chat-locale", locale.value); }
function setLocale(value: Locale): void { locale.value = value; persistLocale(); }

const tabCopy = computed(() => ({
  overview: { eyebrow: `${copy.value.controlRoom} / ${copy.value.overview}`, title: locale.value === "zh-CN" ? "看清网络的全貌。" : "See the shape of the network.", description: locale.value === "zh-CN" ? "实时查看房间、成员和等待处理的决策。" : "A live read on rooms, people, and the decisions waiting for you." },
  rooms: { eyebrow: `${copy.value.controlRoom} / ${copy.value.rooms}`, title: locale.value === "zh-CN" ? "房间是交流的载体。" : "Rooms are instruments.", description: locale.value === "zh-CN" ? "让每个房间保持开放、专注，值得再次回来。" : "Keep each one open, focused, and worth coming back to." },
  reports: { eyebrow: `${copy.value.controlRoom} / ${copy.value.reviewQueue}`, title: locale.value === "zh-CN" ? "结合上下文审核。" : "Review with context.", description: locale.value === "zh-CN" ? "用最小的处理让房间恢复秩序。" : "Resolve the smallest problem that gets the room back in tune." },
  users: { eyebrow: `${copy.value.controlRoom} / ${copy.value.members}`, title: locale.value === "zh-CN" ? "成员塑造房间。" : "People make the room.", description: locale.value === "zh-CN" ? "账号访问是信任边界，而非普通状态字段。" : "Account access is a trust boundary, not just a status field." },
}[tab.value]));
const metrics = computed(() => [
  { label: copy.value.activeMembers, value: overview.value?.activeUsers || 0, detail: `${overview.value?.totalUsers || 0} ${copy.value.registered}`, progress: overview.value?.totalUsers ? Math.round(((overview.value.activeUsers || 0) / overview.value.totalUsers) * 100) : 0, tone: "acid" },
  { label: copy.value.liveRooms, value: overview.value?.activeRooms || 0, detail: `${rooms.value.length} ${copy.value.rooms}`, progress: rooms.value.length ? Math.round(((overview.value?.activeRooms || 0) / rooms.value.length) * 100) : 0, tone: "violet" },
  { label: copy.value.messagesToday, value: overview.value?.messagesToday || 0, detail: copy.value.acrossAllRooms, progress: Math.min(100, (overview.value?.messagesToday || 0) * 4), tone: "coral" },
  { label: copy.value.openReports, value: overview.value?.openReports || 0, detail: overview.value?.openReports ? copy.value.needsDecision : copy.value.queueIsClear, progress: overview.value?.openReports ? 72 : 8, tone: "gold" },
]);
const visibleReports = computed(() => reports.value.filter((report) => reportFilter.value === "all" || report.status === "open"));

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers); headers.set("content-type", "application/json"); if (token.value) headers.set("authorization", `Bearer ${token.value}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Request failed."); return payload as T;
}
async function login(): Promise<void> { busy.value = true; errorMessage.value = ""; try { if (demoMode) { if (form.value.username !== "admin" || form.value.password !== "admin123!") throw new Error("Use the demo account shown below."); token.value = "github-pages-demo-admin"; admin.value = { ...demoAdmin }; localStorage.setItem("match-chat-admin-token", token.value); await loadAll(); return; } const result = await request<{ token: string; user: ImUser }>("/auth/login", { method: "POST", body: JSON.stringify(form.value) }); if (result.user.role !== "admin") throw new Error(copy.value.loginAdminOnly); token.value = result.token; admin.value = result.user; localStorage.setItem("match-chat-admin-token", result.token); await loadAll(); } catch (error) { errorMessage.value = error instanceof Error ? error.message : copy.value.loginFailed; } finally { busy.value = false; } }
async function loadAll(): Promise<void> { if (demoMode) { overview.value = { ...demoOverview.value }; rooms.value = demoRooms.value; reports.value = demoReports.value; members.value = demoMembers.value; lastSync.value = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); return; } const [overviewResult, roomResult, reportResult, memberResult] = await Promise.all([request<{ overview: Overview }>("/admin/overview"), request<{ rooms: ImRoom[] }>("/admin/rooms"), request<{ reports: Report[] }>("/admin/reports"), request<{ users: ImUser[] }>("/admin/users")]); overview.value = overviewResult.overview; rooms.value = roomResult.rooms; reports.value = reportResult.reports; members.value = memberResult.users; lastSync.value = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
async function changeRoomStatus(room: ImRoom, status: string): Promise<void> { try { if (demoMode) { room.status = status as ImRoom["status"]; demoOverview.value.activeRooms = demoRooms.value.filter((item) => item.status === "active").length; notice.value = copy.value.roomUpdated.replace("{name}", room.name).replace("{status}", room.status); await loadAll(); return; } const result = await request<{ room: ImRoom }>(`/admin/rooms/${room.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); Object.assign(room, result.room); notice.value = copy.value.roomUpdated.replace("{name}", room.name).replace("{status}", room.status); await loadAll(); } catch (error) { notice.value = error instanceof Error ? error.message : "Unable to update room."; } }
async function reviewReport(report: Report, status: "reviewed" | "dismissed"): Promise<void> { try { if (demoMode) { report.status = status; report.note = status === "reviewed" ? "Reviewed in demo mode." : "No action taken in demo mode."; report.reviewedAt = new Date().toISOString(); demoOverview.value.openReports = demoReports.value.filter((item) => item.status === "open").length; notice.value = status === "reviewed" ? copy.value.reportResolved : copy.value.reportDismissed; await loadAll(); return; } const result = await request<{ report: Report }>(`/admin/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ status, note: status === "reviewed" ? "Reviewed by operator." : "No action taken." }) }); Object.assign(report, result.report); notice.value = status === "reviewed" ? copy.value.reportResolved : copy.value.reportDismissed; await loadAll(); } catch (error) { notice.value = error instanceof Error ? error.message : "Unable to review report."; } }
async function removeMessage(report: Report): Promise<void> { try { if (demoMode) { report.status = "reviewed"; report.note = "Message removed in demo mode."; report.reviewedAt = new Date().toISOString(); demoOverview.value.openReports = demoReports.value.filter((item) => item.status === "open").length; notice.value = copy.value.messageRemoved; await loadAll(); return; } await request(`/admin/messages/${report.messageId}`, { method: "PATCH", body: JSON.stringify({ status: "removed" }) }); const result = await request<{ report: Report }>(`/admin/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ status: "reviewed", note: "Message removed by operator." }) }); Object.assign(report, result.report); notice.value = copy.value.messageRemoved; await loadAll(); } catch (error) { notice.value = error instanceof Error ? error.message : "Unable to remove message."; } }
async function changeMemberStatus(member: ImUser): Promise<void> { const status = member.status === "active" ? "suspended" : "active"; try { if (demoMode) { member.status = status; demoOverview.value.activeUsers = demoMembers.value.filter((item) => item.status === "active").length; notice.value = `${member.displayName} is ${member.status}.`; return; } const result = await request<{ user: ImUser }>(`/admin/users/${member.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); Object.assign(member, result.user); notice.value = `${member.displayName} is ${member.status}.`; } catch (error) { notice.value = error instanceof Error ? error.message : "Unable to update member."; } }
function roomName(id: string): string { return rooms.value.find((room) => room.id === id)?.name || copy.value.unknownRoom; }
function shortDate(value: string): string { return new Intl.DateTimeFormat(locale.value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function logout(): void { token.value = ""; admin.value = null; localStorage.removeItem("match-chat-admin-token"); }
onMounted(async () => { if (!token.value) return; try { if (demoMode && token.value === "github-pages-demo-admin") { admin.value = { ...demoAdmin }; await loadAll(); return; } const me = await request<{ user: ImUser }>("/me"); if (me.user.role !== "admin") throw new Error("Not an administrator."); admin.value = me.user; await loadAll(); } catch { logout(); } });
</script>

<style>
.danger-button {
  padding: 9px 10px;
  color: var(--coral);
  background: rgba(255, 128, 109, .08);
  border: 1px solid rgba(255, 128, 109, .26);
  border-radius: 7px;
  font-size: 11px;
  cursor: pointer;
}

.danger-button:hover {
  background: rgba(255, 128, 109, .16);
}

.language-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  color: var(--muted);
  font-size: 12px;
}

.language-setting select,
.language-select {
  color: var(--text);
  background: #10131b;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: inherit;
}

.language-setting select {
  padding: 7px 9px;
}

.language-select {
  padding: 5px 7px;
  font-size: 11px;
}
</style>
