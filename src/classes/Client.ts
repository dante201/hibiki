/**
 * @file Client
 * @description Connects to Discord and handles global functions
 */

import type { ClientOptions } from "eris";
import type { Command } from "./Command";
import type { Event } from "./Event";
import type { Logger } from "./Logger";
import Eris, { Client } from "eris";
import { Args } from "./Args";
import { Lavalink } from "./Lavalink";
import { LocaleSystem } from "./Locale";
import { RethinkProvider } from "./RethinkDB";
import { convertHex, createEmbed, editEmbed } from "../helpers/embed";
import { loadItems } from "../scripts/loader";
import { tagUser } from "../utils/format";
import { logger } from "../utils/logger";
import { statuses } from "../helpers/statuses";
import { InviteHandler } from "../scripts/invites";
import { MonitorHandler } from "../scripts/monitors";
import { MuteHandler } from "../scripts/mutes";
import { ReminderHandler } from "../scripts/reminders";
import { startDashboard } from "../webserver/dashboard";
import { startVoting } from "../webserver/voting";
import path from "path";
import config from "../../config.json";
import * as Sentry from "@sentry/node";

const LOCALES_DIRECTORY = path.join(__dirname, "../locales");

export class HibikiClient extends Client {
  antiSpam: AntiSpam[];
  args: Args;
  commands: Array<Command> = [];
  config: typeof config;
  cooldowns: Map<string, Date>;
  db: RethinkProvider;
  events: Array<Event> = [];
  inviteHandler: InviteHandler;
  lavalink: Lavalink;
  localeSystem: LocaleSystem;
  log: typeof logger;
  loggers: Array<Logger> = [];
  logs: BotLogs[];
  monitorHandler: MonitorHandler;
  muteHandler: MuteHandler;
  reminderHandler: ReminderHandler;
  snipeData: SnipeData;

  constructor(token: string, options: ClientOptions) {
    super(token, options);
    this.config = config;

    // Prototype extensions
    Eris.Message.prototype.createEmbed = createEmbed;
    Eris.Message.prototype.editEmbed = editEmbed;
    Eris.Message.prototype.convertHex = convertHex;
    Eris.Message.prototype.tagUser = tagUser;

    // Collections
    this.antiSpam = [];
    this.commands = [];
    this.events = [];
    this.loggers = [];
    this.logs = [];
    this.snipeData = {};
    this.cooldowns = new Map();

    // Handlers & functions
    this.log = logger;
    this.args = new Args(this);
    this.db = new RethinkProvider();
    this.lavalink = new Lavalink(this);
    this.localeSystem = new LocaleSystem(LOCALES_DIRECTORY);
    this.inviteHandler = new InviteHandler(this);
    this.monitorHandler = new MonitorHandler(this);
    this.muteHandler = new MuteHandler(this);
    this.reminderHandler = new ReminderHandler(this);
    this.requestHandler = new Eris.RequestHandler(this);

    this.connect();
    this.editStatus("idle");
    this.once("ready", () => this.readyListener());
  }

  // Runs when the bot is ready
  async readyListener() {
    loadItems(this);
    statuses(this);
    if (config.sentry) this.initializeSentry();
    if (config.lavalink.enabled) this.lavalink.manager.init(this.user.id);

    // Starts webservers at first boot
    if (process.uptime() < 20) {
      if (config.dashboard.port) await startDashboard(this);
      if (config.keys.botlists.voting.auth && config.keys.botlists.voting.port) await startVoting(this);
    }

    this.log.info(`${this.commands.length} commands loaded`);
    this.log.info(`${this.events.length} events loaded`);
    this.log.info(`${this.loggers.length} loggers loaded`);
    this.log.info(`${Object.keys(this.localeSystem.locales).length} locales loaded`);
    this.log.info(`Logged in as ${tagUser(this.user)} on ${this.guilds.size} guilds`);
  }

  // Initializes sentry
  initializeSentry() {
    try {
      Sentry.init({
        dsn: config.sentry,
        environment: process.env.NODE_ENV,
        release: process.env.npm_package_version,
        tracesSampleRate: 0.5,
        maxBreadcrumbs: 50,
        attachStacktrace: true,
      });
    } catch (err) {
      this.log.error(`Sentry failed to initialize: ${err}`);
    }
  }
}
