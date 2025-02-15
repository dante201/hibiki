/**
 * @file Voting webserver
 * @description Webserver for voting rewards
 * @module webserver/voting
 */

import type { HibikiClient } from "../classes/Client";
import { convertHex } from "../helpers/embed";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Voting handler ratelimit
const votingRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: "Too many voting requests in the past minute. Try again later.",
});

const app = express();
app.enable("trust proxy");
app.use(express.json());
app.use(helmet());
app.use(votingRateLimit);

export async function startVoting(bot: HibikiClient) {
  if (!bot.config.keys.botlists.voting.auth || !bot.config.keys.botlists.voting.port) return;

  app.post("/voteReceive", async (req, res) => {
    // Sends if unauthorized
    if (req.headers.authorization !== bot.config.keys.botlists.voting.auth) {
      if (req.headers.authorization?.length || !req.headers.authorization) {
        bot.log.warn(`${req.socket.remoteAddress} tried to make a request with the wrong auth key.`);
        return res.sendStatus(401);
      }
    }

    // Gets info from the request
    const user = bot.users.get(req.body.user);
    let cookies = await bot.db.getUserCookies(req.body.user);

    if (!cookies) {
      await bot.db.insertBlankUserCookies(req.body.user);
      cookies = { id: req.body.user, amount: 0, lastclaim: null };
    }

    // Sets amount; if weekend give 300
    let amnt = cookies.amount + 150;
    if (req.body.isWeekend) amnt += 150;
    cookies = { id: req.body.user, amount: amnt, lastclaim: cookies.lastclaim };

    // Updates db
    await bot.db.updateUserCookies(req.body.user, cookies);

    // DMs the voter
    if (user) {
      const dmChannel = await user.getDMChannel().catch(() => {});
      if (!dmChannel) return;

      // Gets the user's locale
      const userLocale = await bot.localeSystem.getUserLocale(`${user}`, bot);
      const string = bot.localeSystem.getLocaleFunction(userLocale);

      await dmChannel
        .createMessage({
          embed: {
            title: `✨ ${string("global.THANKS_FOR_VOTING")}`,
            description: string("global.VOTING_COOKIES_ADDED", { amount: req.body.isWeekend ? "300" : "150" }),
            color: convertHex("general"),
          },
        })
        .catch(() => {});
    }

    // Sends msg of who voted
    await bot.createMessage(bot.config.logchannel, {
      embed: {
        title: "🗳 User Voted",
        description: `**${user ? user.username : req.body.user}** has voted.`,
        color: convertHex("general"),
      },
    });

    // Logs when a user votes
    bot.log.info(`${user ? user.username : req.body.user} has voted.`);
    res.sendStatus(200);
  });

  // Listens on port
  app.listen(bot.config.keys.botlists.voting.port, "0.0.0.0", async () => {
    bot.log.info(`Voting handler listening on port ${bot.config.keys.botlists.voting.port}`);
  });
}
