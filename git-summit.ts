import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import OpenAI from "openai";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import semver from "semver";

const git = simpleGit();

enum ReleaseType {
  major = "major",
  premajor = "premajor",
  minor = "minor",
  preminor = "preminor",
  patch = "patch",
  prepatch = "prepatch",
  prerelease = "prerelease",
}

interface Options {
  changelog: string | null;
  bump: ReleaseType;
  output: string | null;
  context: string | null;
  sinceTag: string | null;
  fun: boolean;
  emoji: boolean;
  summary: boolean;
  dryRun: boolean;
}

// Parse CLI arguments and options using yargs
const argv = yargs(hideBin(process.argv))
  .command("$0", "Update changelog and create release notes using OpenAI")
  .option("changelog", {
    type: "string",
    describe: "Path to the CHANGELOG.md file",
    demandOption: false,
  })
  .option("output", {
    type: "string",
    describe: "Path to the output file where the release notes will be written",
    demandOption: false,
    default: null,
  })
  .option("bump", {
    type: "string",
    choices: Object.values(ReleaseType),
    describe: "The type of version bump",
    demandOption: true,
  })
  .option("context", {
    type: "string",
    describe: "Additional context for the OpenAI API",
    default: null,
  })
  .option("since-tag", {
    type: "string",
    describe: "The tag to start from when generating release notes",
    default: null,
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
  argv.context,
  argv.sinceTag,
  argv.fun,
  argv.emoji,
  argv.summary,
  argv.dryRun
);

async function main(
  changelogPathArg: string | null,
  outputPathArg: string | null,
  bumpArg: string,
  context: string | null,
  sinceTag: string | null,
  fun: boolean,
  emojis: boolean,
  summary: boolean,
  dryRun: boolean
) {
  const openAIKey = process.env.OPENAI_API_KEY;
  const changelogPath = changelogPathArg
    ? path.join(process.cwd(), changelogPathArg)
    : null;
  const outputPath = outputPathArg
    ? path.join(process.cwd(), outputPathArg)
    : null;

  if (!openAIKey) {
    console.error(
      "❌ Please set the OPENAI_API_KEY environment variable to use this script."
    );
    return;
  }

  try {
    const latestTag = await getLatestTag();
    const since = sinceTag ? await getSinceTag(sinceTag) : latestTag;
    const commits = await getCommitsSinceTag(since);
    const newVersion = getNewVersion(bumpArg as ReleaseType, latestTag);

    console.log("⬆️ Bumping version: ", since, " => ", newVersion);
    console.log(`📋 Commits since tag "${since}":`, commits);

    console.log("🤖 Waiting for OpenAI to summarize the commits...");
    const summary = await summarizeCommits(commits, newVersion);

    if (dryRun) {
      console.log("🔍 Dry run enabled. Skipping file writes.");
      console.log("📝 Current release notes:\n\n", summary, "\n");
    } else {
      writeCurrentRelease(summary);
      updateChangelog(summary);
    }

    console.log("✅ All done!");
  } catch (error) {
    console.error("❌ Error updating changelog:", error);
  }

  // Get the new version based on the versionArg and since
  function getNewVersion(releaseType: ReleaseType, since: string): string {
    const parsed = semver.parse(since);
    if (!parsed) {
      throw new Error("Invalid semver version: " + since);
    }

    return parsed.inc(releaseType).format();
  }

  // Get the latest tag
  async function getLatestTag(): Promise<string> {
    const tags = await git.tags();

    if (tags.all.length === 0) {
      throw new Error("No tags found in the repository.");
    }

    return tags.latest ?? "";
  }

  // Get commits from the given tag
  async function getSinceTag(since: string): Promise<string> {
    const tags = await git.tags();

    if (tags.all.length === 0) {
      throw new Error("No tags found in the repository.");
    }

    const sinceTag = tags.all.find((tag) => tag === since);
    if (!sinceTag) {
      throw new Error("Tag not found: " + since);
    }

    return sinceTag;
  }

  // Get commits from the last tag
  async function getCommitsSinceTag(tag: string): Promise<string[]> {
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
    Avoid exposing sensitive information. Make it concise and easy to understand. Don't include information about PRs or issues.
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
    if (!changelogPath) {
      return;
    }

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
    if (!outputPath) {
      return;
    }

    fs.writeFileSync(outputPath, newEntry, "utf-8");
  }
}
