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
    this.serverless.cli.log(`Collecting migrations...`);
    const compiledFolder = await compileFolder(settings.migrationsFolder);
    this.migrations = compiledFolder
      .map((m) => m.default)
      .sort((a, b) => a.serial - b.serial);
    this.serverless.cli.log(`Migrations collected...`);
  }

  async migrateStart() {
    const db = await dbSettings(
      undefined,
      undefined,
      this.serverless.service.provider.environment,
    );
    this.serverless.cli.log(`Connection to database...`);
    const client = new pg.Client(db);
    this.serverless.cli.log(`Running migrations...`);
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
        this.serverless.cli.log(`Rolling back...`);
        this.serverless.cli.log(`Damp run successful.`);
      } else {
        this.serverless.cli.log(`Migrations complete.`);
      }
      await client.end();
    } catch (err) {
      this.serverless.cli.log(
        `An error occurred while running migrations. All changes have been reverted.`,
      );
      await client.end();
      throw err;
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
      this.serverless.cli.log("Creating migrations folder...");
      await fs.mkdir(settings.migrationsFolder);
    }
    await fs.writeFile(outfile, compiledTemplate);
    this.serverless.cli.log(`Migration created: ${outfile}`);
  }
}

module.exports = ServerlessPlugin;
