import { createApp } from "vue";
import { ImChatPanel } from "@match-chat/im-ui";
import "@match-chat/im-ui/style.css";
import App from "./App.vue";
import "./styles.css";

createApp(App).component("ImChatPanel", ImChatPanel).mount("#app");
