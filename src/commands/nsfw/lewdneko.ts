import type { NekobotImage } from "../../typings/endpoints";
import type { Message, TextChannel } from "eris";
import { Command } from "../../classes/Command";
import { resError } from "../../utils/exception";
import axios from "axios";

export class LewdnekoCommand extends Command {
  description = "Sends a NSFW image of a catgirl/neko.";
  aliases = ["catgirlhentai", "nekohentai", "lewdcatgirl"];
  cooldown = 4000;
  allowdms = true;
  nsfw = true;

  async run(msg: Message<TextChannel>) {
    const body = (await axios.get("https://nekobot.xyz/api/image?type=hneko").catch((err) => {
      resError(err);
    })) as NekobotImage;

    if (!body || !body.data?.message) {
      return msg.createEmbed(msg.string("global.ERROR"), msg.string("global.RESERROR_IMAGE"), "error");
    }

    msg.channel.createMessage({
      embed: {
        title: `🐱 ${msg.string("nsfw.LEWDNEKO")}`,
        color: msg.convertHex("general"),
        image: {
          url: body.data.message,
        },
        footer: {
          text: msg.string("global.RAN_BY", {
            author: msg.tagUser(msg.author),
            poweredBy: "api.nekobot.xyz",
          }),
          icon_url: msg.author.dynamicAvatarURL(),
        },
      },
    });
  }
}
