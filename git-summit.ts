import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import OpenAI from "openai";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const git = simpleGit();

enum Version {
  Major = "major",
  Minor = "minor",
  Patch = "patch",
}

interface Options {
  changelog: string;
  output: string;
  bump: Version;
  fun: boolean;
  emoji: boolean;
  summary: boolean;
  context: string;
  dryRun: boolean;
}

// Parse CLI arguments and options using yargs
const argv = yargs(hideBin(process.argv))
  .command("$0", "Update changelog and create release notes using OpenAI")
  .option("changelog", {
    type: "string",
    describe: "Path to the CHANGELOG.md file",
    demandOption: true,
  })
  .option("output", {
    type: "string",
    describe: "Path to the output file where the release notes will be written",
    demandOption: true,
  })
  .option("bump", {
    type: "string",
    choices: Object.values(Version),
    describe: "The type of version bump",
    demandOption: true,
  })
  .option("summary", {
    type: "boolean",
    describe: "Generate a summary at the top of the release notes",
    default: false,
  })
  .option("fun", {
    type: "boolean",
    describe: "Make the content fun!",
    default: false,
  })
  .option("emoji", {
    type: "boolean",
    describe: "Include emojis in the content",
    default: false,
  })
  .option("context", {
    type: "string",
    describe: "Additional context for the OpenAI API",
  })
  .option("dry-run", {
    type: "boolean",
    describe: "Run the script without making any changes",
    default: false,
  })
  .demandCommand(0) // Ensure at least one command is passed
  .help()
  .parseSync() as Options; // Parse the arguments and cast them to the Options interface

// Call the main function with the parsed arguments
main(
  argv.changelog,
  argv.output,
  argv.bump,
  argv.fun,
  argv.emoji,
  argv.summary,
  argv.context,
  argv.dryRun
);

async function main(
  changelogPathArg: string,
  outputPathArg: string,
  versionArg: string,
  fun: boolean,
  emojis: boolean,
  summary: boolean,
  context: string,
  dryRun: boolean
) {
  const openAIKey = process.env.OPENAI_API_KEY;
  const changelogPath = path.join(process.cwd(), changelogPathArg);
  const outputPath = path.join(process.cwd(), outputPathArg);

  if (!openAIKey) {
    console.error(
      "❌ Please set the OPENAI_API_KEY environment variable to use this script."
    );
    return;
  }

  try {
    const latestTag = await getLatestTag();
    const commits = await getCommitsSinceLastTag(latestTag);
    const newVersion = getNewVersion(versionArg as Version, latestTag);

    console.log("⬆️ Bumping version: ", latestTag, " => ", newVersion);
    console.log("📋 Commits since last tag:", commits);

    console.log("🤖 Waiting for OpenAI to summarize the commits...");
    const summary = await summarizeCommits(commits, newVersion);

    if (dryRun) {
      console.log("🔍 Dry run enabled. Skipping file writes.");
      console.log("📝 Current release notes:\n", summary);
    }

    writeCurrentRelease(summary);
    updateChangelog(summary);

    console.log(
      `✅ Changelog updated and current release notes written to: \n${outputPath}\n${changelogPath}`
    );
  } catch (error) {
    console.error("❌ Error updating changelog:", error);
  }

  // Get the new version based on the versionArg and latestTag
  function getNewVersion(version: Version, latestTag: string): string {
    const newVersion = latestTag.replace(
      /v(\d+\.\d+\.\d+)/,
      (match, current) => {
        const [major, minor, patch] = current.split(".").map(Number);

        switch (version) {
          case Version.Major:
            return `v${major + 1}.0.0`;
          case Version.Minor:
            return `v${major}.${minor + 1}.0`;
          case Version.Patch:
            return `v${major}.${minor}.${patch + 1}`;
          default:
            return match;
        }
      }
    );

    return newVersion;
  }

  // Get the latest tag
  async function getLatestTag(): Promise<string> {
    const tags = await git.tags();
    return tags.latest || "";
  }

  // Get commits from the last tag
  async function getCommitsSinceLastTag(tag: string): Promise<string[]> {
    const log = await git.log({ from: tag, to: "HEAD" });
    return log.all.map((commit) => commit.message);
  }

  // Summarize commits using OpenAI
  async function summarizeCommits(commits: string[], newVersion: string) {
    const openai = new OpenAI({
      apiKey: openAIKey,
    });
    const dateFormatted = new Date().toISOString().split("T")[0];

    const prompt = `
    Summarize the following git commit messages into concise release notes for version: ${newVersion}.
    For version denominations, use the format "[major.minor.patch] - ${dateFormatted}".
    Make sure to adhere to https://keepachangelog.com/en/1.0.0/.
    Create only "New Features", "Improvements", "Bug Fixes" and "Additional Notes" sections if needed.
    ${summary ? "Add summary of the changes at the top." : ""}
    Avoid exposing sensitive information. Make it concise and easy to understand.
    The release notes should be suitable for a public audience as they will be included in the app's release notes.
    ${
      fun &&
      "Make it fun and engaging, you can include jokes, but don't make it too long."
    }
    ${
      emojis && "You can use emojis if you like, but don't use them in heading."
    }
    ${context ? context : ""}
    Return proper markdown format.
    Those are the commits since the last tag:
    ${commits.join("\n")}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0].message.content ?? "";
  }

  // Update CHANGELOG.md
  function updateChangelog(newEntry: string): void {
    let changelog = "";
    if (fs.existsSync(changelogPath)) {
      changelog = fs.readFileSync(changelogPath, "utf-8");
    }

    // we need to update only part of the file
    // below ## [Unreleased] we should add new entry which is a new version with release notes
    const split = changelog.split("## [Unreleased]");
    const newChangelog = `${split[0]}## [Unreleased]\n\n${newEntry}${split[1]}`;

    fs.writeFileSync(changelogPath, newChangelog, "utf-8");
  }

  // Write the current release notes to current_release.md
  function writeCurrentRelease(newEntry: string): void {
    fs.writeFileSync(outputPath, newEntry, "utf-8");
  }
}
