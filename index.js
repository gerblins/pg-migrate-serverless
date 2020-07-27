const {
  migrate,
  Migration,
  dbSettings,
  appSettings,
  compileFolder,
} = require("@gerblins/pg-migrate");
const pg = require("pg");

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
      );
      console.info(`Migrations complete.`);
    } catch (err) {
      console.error(
        `An error occurred while running migrations. All changes have been reverted.`,
      );
      console.error(err);
    }
    await client.end();
  }
}

module.exports = ServerlessPlugin;
