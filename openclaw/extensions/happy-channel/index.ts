/**
 * Happy Channel Plugin for OpenClaw
 *
 * Enables OpenClaw to communicate through Happy's mobile/web clients
 * as a messaging channel.
 */
import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { happyChannelPlugin } from "./src/channel.js";

// Plugin definition
const plugin = {
    id: "happy-channel",
    name: "Happy",
    description: "Happy mobile/web client channel for AI conversations",
    register(api: OpenClawPluginApi) {
        api.registerChannel({ plugin: happyChannelPlugin as ChannelPlugin });
    },
};

export default plugin;
export { happyChannelPlugin };
