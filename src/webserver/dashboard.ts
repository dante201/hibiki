/**
 * @file Dashboard
 * @description Main webserver for the dashboard
 * @module webserver/dashboard
 */

import type { HibikiClient } from "../classes/Client";
import type { NextFunction, Request, Response } from "express";
import { readFileSync, readdirSync } from "fs";
import { RethinkDBStore } from "session-rethinkdb-ts";
import { minify } from "terser";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import express from "express";
import expressSession from "express-session";
import helmet from "helmet";
import passport from "passport";

const app = express();
app.enable("trust proxy");

// Enables robots.txt
app.get("/robots.txt", function (req, res) {
  res.type("text/plain");
  res.send("User-agent: *\nCrawl-delay: 5\nDisallow: /public/\nDisallow: /auth/");
});

// Disables cache-control on specified routes
const noCache = (_req: Request, res: Response, next: NextFunction) => {
  res.header("Cache-Control", "no-cache");
  next();
};

app.use(helmet({ contentSecurityPolicy: false }));

// Sets securityPolicy
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "cdn.discordapp.com"],
      scriptSrc: ["'self'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
    },
  }),
);

// Starts the dashboard
export async function startDashboard(bot: HibikiClient) {
  if (!bot.config.dashboard.port || !bot.config.dashboard.redirectURI || !bot.config.dashboard.botSecret) return;
  if (!bot.config.dashboard.cookieSecret) return;

  // Creates a session RethinkDB store
  const sessionStore = new RethinkDBStore({
    connectOptions: {
      db: bot.config.database.db || undefined,
      password: bot.config.database.password || undefined,
      port: bot.config.database.port || 28015,
      host: bot.config.database.host || undefined,
      user: bot.config.database.user || undefined,
      silent: true,
    },
  });

  // Enables bodyParser
  app.use(bodyParser.urlencoded({ extended: true, parameterLimit: 10000, limit: "5mb" }));
  app.use(bodyParser.json({ limit: "5mb" }));

  // Sets headers
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  // Enables expressSession
  app.use(
    expressSession({
      secret: bot.config.dashboard.cookieSecret,
      store: sessionStore,
      name: bot.user.username,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        signed: true,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        // if you're getting infinite redirects when trying to auth, either setup https or set this to false
        secure: process.env.NODE_ENV === "production",
      },
      resave: false,
      saveUninitialized: false,
    }),
  );

  // Enables cookieParser and csurf
  app.use(cookieParser(bot.config.dashboard.cookieSecret));
  app.use(csurf({ cookie: true }));

  // Enables passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Directories and EJS options
  app.set("views", `${__dirname}/views`);
  app.set("partials", `${__dirname}/partials`);
  app.set("view engine", "ejs");

  // Minifies files if running in production
  if (process.env.NODE_ENV === "production") {
    const files = readdirSync(`${__dirname}/public/js`, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) return;
      if (!file.name.endsWith(".js")) return;
      const fileSource = readFileSync(`${__dirname}/public/js/${file.name}`, { encoding: "utf-8" });
      const minifiedFile = await minify(fileSource);

      // Falls back to using non-minified files
      if (!minifiedFile.code) {
        bot.log.error(`Error while minifying ${file.name}, the non-minified one will be served instead.`);
        app.use(`/public/js/${file.name}`, (req, res) => {
          res.send(fileSource);
        });

        return;
      }

      // Uses the minified files
      app.use(`/public/js/${file.name}`, (req, res) => {
        res.set("Content-Type", "application/javascript").send(minifiedFile.code);
      });
    }
  }

  app.use("/public/", express.static(`${__dirname}/public`, { dotfiles: "allow" }));

  // Routes and APIs
  app.use("/", require("./routes/index")(bot));
  app.use("/api/", noCache, require("./routes/api")(bot));
  app.use("/auth/", noCache, require("./routes/auth")(bot));
  app.use("/manage/", noCache, require("./routes/manage")(bot));

  // 404 handler
  app.use((req, res) => {
    if (req.accepts("html")) return res.status(404).render("404", { url: req.url });
    else if (req.accepts("json")) return res.status(404).send({ error: "404" });
    else res.status(404).type("txt").send("404");
  });

  // Listens on the configured port
  app.listen(bot.config.dashboard.port, async () => {
    bot.log.info(`Dashboard running on port ${bot.config.dashboard.port}`);
  });
}
