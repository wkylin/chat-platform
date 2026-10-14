<template>
  <section
    class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-3xl border border-white/10 bg-[#12151e] text-[#f2f5fb]">
    <header
      class="flex flex-col items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:gap-[18px] sm:px-[22px]">
      <div>
        <span class="font-mono text-[10px]/[1.2] font-semibold uppercase tracking-[0.15em] text-[#8b96aa]">{{
          copy.liveThread }}</span>
        <h2 class="mt-[7px] text-[19px] tracking-normal">{{ roomName }}</h2>
      </div>
      <div class="self-start whitespace-nowrap text-xs text-[#8b96aa] sm:self-auto">
        <span class="mr-1.5 inline-block size-[7px] rounded-full bg-[#687386]"
          :class="{ 'bg-[#b6f36b] shadow-[0_0_0_4px_rgba(182,243,107,0.1)]': connectionStatus === 'online', 'bg-[#ff8068]': connectionStatus === 'error' }"></span>
        {{ statusLabel }}
        <span v-if="memberCount > 0">· {{ memberCount }} {{ copy.people }}</span>
      </div>
    </header>

    <div ref="feed" class="min-h-0 overflow-y-auto px-5 py-6 sm:px-[22px]" aria-live="polite">
      <div v-if="!messages.length" class="grid min-h-60 place-items-center text-center text-[#8b96aa]">
        <span class="text-[38px] text-[#b6f36b]">◎</span>
        <strong class="mt-3.5 text-[#f2f5fb]">{{ copy.emptyTitle }}</strong>
        <p class="m-0 mt-[5px] text-[13px]">{{ copy.emptyDescription }}</p>
      </div>
      <article v-for="message in messages" :key="message.id"
        class="group mb-[18px] max-w-[88%] sm:max-w-[min(72%,560px)]"
        :class="{ 'ml-auto': message.userId === currentUserId || message.mine }">
        <div class="flex items-baseline gap-2.5 text-[11px] text-[#8b96aa]">
          <strong class="text-xs text-[#cdd4e1]">{{ message.displayName }}</strong>
          <time>{{ formatTime(message.createdAt) }}</time>
          <button v-if="message.userId !== currentUserId && !message.mine" type="button"
            class="cursor-pointer bg-transparent p-0 font-mono text-[10px] text-[#6f7b8d] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
            @click.stop="emit('report', message.id)">
            {{ copy.report }}
          </button>
        </div>
        <p class="im-chat-message m-0 mt-1.5 [overflow-wrap:anywhere] whitespace-pre-wrap rounded-[4px_14px_14px_14px] border border-white/10 bg-[#1a1f2a] px-[13px] py-[11px] text-sm leading-6 text-[#e9edf5]"
          :class="{ 'im-chat-message--mine rounded-[14px_4px_14px_14px] border-transparent bg-[#b6f36b]': message.userId === currentUserId || message.mine }">
          {{ message.status === "removed" ? copy.removedMessage : message.body }}</p>
      </article>
    </div>

    <form class="border-t border-white/10 px-5 py-5 sm:px-[22px]" @submit.prevent="submit">
      <textarea v-model="draft" :disabled="disabled" rows="2" maxlength="4000"
        class="block min-h-[58px] w-full resize-y rounded-xl border border-white/10 bg-[#0e1118] px-[13px] py-3 text-inherit text-[#f2f5fb] outline-none focus:border-[#b6f36b] disabled:cursor-not-allowed disabled:opacity-50"
        :placeholder="disabled ? copy.unavailablePlaceholder : copy.composerPlaceholder"
        @keydown.enter.exact.prevent="submit"></textarea>
      <div class="mt-[9px] flex items-center justify-between gap-4 text-[11px] text-[#8b96aa]">
        <span>{{ copy.sendHint }}</span>
        <button type="submit"
          class="cursor-pointer rounded-[9px] bg-[#b6f36b] px-3.5 py-[9px] text-xs font-bold text-[#11140e] disabled:cursor-not-allowed disabled:opacity-[0.42]"
          :disabled="disabled || !draft.trim()">{{ copy.send }}</button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ImChatMessage, ImChatPanelLabels, XmppConnectionStatus } from "../types";

const defaultLabels: ImChatPanelLabels = {
  liveThread: "room / live thread",
  people: "people",
  emptyTitle: "The room is quiet.",
  emptyDescription: "Start the thread with a clear signal.",
  report: "report",
  removedMessage: "This message was removed by a moderator.",
  unavailablePlaceholder: "Room is not accepting messages",
  composerPlaceholder: "Write to the room…",
  sendHint: "Enter to send · Shift + Enter for a new line",
  send: "Send signal",
  status: { idle: "Standby", connecting: "Connecting", online: "Live", offline: "Offline", error: "Needs attention" },
};

const props = withDefaults(
  defineProps<{
    roomName: string;
    messages: ImChatMessage[];
    currentUserId?: string;
    memberCount?: number;
    connectionStatus?: XmppConnectionStatus;
    disabled?: boolean;
    labels?: ImChatPanelLabels;
    locale?: string;
  }>(),
  {
    currentUserId: "",
    memberCount: 0,
    connectionStatus: "offline",
    disabled: false,
    locale: undefined,
  },
);
const emit = defineEmits<{
  send: [body: string];
  report: [messageId: string];
}>();
const draft = ref("");
const feed = ref<HTMLElement | null>(null);
const copy = computed(() => props.labels || defaultLabels);
const statusLabel = computed(() => computedStatus(props.connectionStatus));

function computedStatus(status: XmppConnectionStatus): string {
  return copy.value.status[status];
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(props.locale, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

function submit(): void {
  const value = draft.value.trim();
  if (!value || props.disabled) return;
  emit("send", value);
  draft.value = "";
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
  },
);
</script>

<style scoped>
.im-chat-message--mine {
  color: #172112;
  font-weight: 500;
}
</style>
