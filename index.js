const {
  migrate,
  Migration,
  dbSettings,
  appSettings,
  compileFolder,
  compileTemplate,
} = require("@gerblins/pg-migrate");
const pg = require("pg");
const path = require("path");
const { promises: fs } = require("fs");

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      migration: {
        usage: "Migrates using @gerblins/pg-migrate",
        commands: {
          migrate: {
            usage: "Runs migrations",
            lifecycleEvents: ["setup", "start"],
          },
          create: {
            usage: "Creates a migration from a template",
            lifecycleEvents: ["start"],
            options: {
              damp: {
                usage: "Runs the queries but rolls them back",
                required: false,
              },
            },
          },
        },
        // options: {
        //   message: {
        //     usage:
        //       "Specify the message you want to deploy " +
        //       "(e.g. \"--message 'My Message'\" or \"-m 'My Message'\")",
        //     required: true,
        //     shortcut: "m",
        //   },
        // },
      },
    };

    this.hooks = {
      "migration:migrate:setup": this.migrateSetup.bind(this),
      "migration:migrate:start": this.migrateStart.bind(this),
      "migration:create:start": this.createStart.bind(this),
    };
  }

  async migrateSetup() {
    const settings = await appSettings(
      undefined,
      undefined,
      this.serverless.service.provider.environment,
    );
    console.info(`Collecting migrations...`);
    const compiledFolder = await compileFolder(settings.migrationsFolder);
    this.migrations = compiledFolder
      .map((m) => m.default)
      .sort((a, b) => a.serial - b.serial);
    console.info(`Migrations collected...`);
  }

  async migrateStart() {
    const db = await dbSettings(
      undefined,
      undefined,
      this.serverless.service.provider.environment,
    );
    console.info(`Connection to database...`);
    const client = new pg.Client(db);
    console.info(`Running migrations...`);
    await client.connect();
    try {
      await migrate(
        client,
        this.migrations,
        db.migrationSchema || "public",
        db.migrationTable || "__migrations",
        !this.options.damp,
      );

      if (this.options.damp) {
        console.info(`Rolling back...`);
        console.info(`Damp run successful.`);
      } else {
        console.info(`Migrations complete.`);
      }
      await client.end();
    } catch (err) {
      console.error(
        `An error occurred while running migrations. All changes have been reverted.`,
      );
      console.error(err);
      await client.end();
      process.exit(1);
    }
  }

  async createStart() {
    const settings = await appSettings(
      undefined,
      undefined,
      this.serverless.service.provider.environment,
    );
    const now = new Date();
    const serial = `${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDay()}${now.getUTCHours()}${now.getUTCMinutes()}${now.getUTCSeconds()}`;
    const compiledTemplate = await compileTemplate(settings.migrationTemplate, {
      serial,
    });
    const outfile = path.join(
      settings.migrationsFolder,
      `${serial}.migration.ts`,
    );
    try {
      await fs.access(settings.migrationsFolder);
    } catch {
      console.log("Creating migrations folder...");
      await fs.mkdir(settings.migrationsFolder);
    }
    await fs.writeFile(outfile, compiledTemplate);
    console.info(`Migration created: ${outfile}`);
  }
}

module.exports = ServerlessPlugin;
