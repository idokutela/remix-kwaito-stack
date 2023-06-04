# Remix Kwaito Stack
A bare bones [Remix stack](https://remix.run/docs/en/main/pages/stacks) for apps on [fly.io] running PostgreSQL.
The goal of Kwaito is to get you set up quickly with a solid fly app, and make it easy to understand and extend.

To create a new app, just run
```
npx create-remix@latest --template idokutela/remix-kwaito-stack
```

## What's in the stack

- [Fly app deployment](https://fly.io/docs/reference/scaling/) with [Docker](https://www.docker.com/)
- [Fly PostgreSQL Cluster](https://fly.io/docs/getting-started/multi-region-databases/)
- Healthcheck endpoint for [Fly backups region fallbacks](https://fly.io/docs/reference/configuration/#services-http_checks)
- basic PostgreSQL with [pg](https://node-postgres.com/) and a simple migration script.
- Static Types with [TypeScript](https://typescriptlang.org)

The following is *not* in the stack (but don't worry, if you keep reading, I'll explain how you set up those bits that you need):
- Styling
- Code formatting
- Linting
- End-to-end testing
- Local third party request mocking
- Unit testing
- Monitoring
- CI/CD: you have to do things manually. Look below to see how to set up Github Actions or Bitbucket Pipelines to do the work for you.

## Understanding the stack
The stack is based on Remix's node endpoint. It lets you develop locally against a Docker container running PostgreSQL. When you're ready for your deploy, follow the guide below and you'll have a fly staging and prod instance running your app, with a Fly PostgreSQL cluster for each. I'll also explain how you can scale this to multiple regions as/when the need applies.

When the stack initialises, it sets up the following basic directory structure:

 - /app - your remix app goes here. You'll find the usual Remix file structure here, along with `db.server.ts`, which sets up a connection pool to the appropriate database. It also comes with a helpful utility to let you run SQL queries using tagged template literals. If you already have a running app, you can probably copy it in unchanged. Just make sure you update your database logic based on `db.server.ts`.
 - /db - you define your database schema here. See the [Setting up your databse](#setting-up-your-database) section for details.
 - /public - the standard Remix public folder
 - /scripts - utility scripts go here. The `migrate.ts` script does the job of setting up and migrating your database. The `seed.ts` stub gets run when you call setup and seeds your local dev DB.

 In the root folder you will find
 - server.ts : this runs the server. It's a pretty simple node/express server: [read how it works](#understanding-the-server).
 - README.md - this file
 
 and various config files. Important ones are:
 - docker-compose.yml : sets up the dev postgres container
 - Dockerfile, .dockerignore, fly.toml: these are relevant to setting up your fly account.
 - .env (.env.example): you set up your local environment variables here. This is prepopulated with those variables necessary for DB access and session management.
 - remix.config.js/remix.env.d.ts : remix config
 - package.json - along with the dependencies, this defines various useful scripts.

### Understanding the server
The server is a simple node/express server. I highly recommend you just read the source. It can handle multi-region deploys out of the box: the code to do so is the only mildly tricky code in the server.

**NB**: out of the box, there is no request logging/monitoring set up. You are free to add your own. Read about [adding request logging with Morgan](#setting-up-morgan) and [monitoring with Prometheus](#monitoring-with-prometheus) to get an idea how to do so.

## Setting up your database
Kwaito aims to be as low on magic as possible. It uses PostgreSQL for state persistence. To set up your schema, you put <version>.up/down.sql files in ./db.

The migrate script creates a table __schema_version which keeps track of the version. When it is run, it checks the current version looks at the schema definition files in ./db. If it finds files with higher numbers, it runs these in order in a giant transaction until it reaches the final version. You can also run the migrate script by hand to migrate the schema to a specific version: run `npm run setup:db -- <version>`. This then either applied the requisite "up" or "down" scripts to migrate to that version.

The migrate script is very simple: I encourage you to read it!

### Your database when developing
For developing, it is often useful to seed your database with data. The standard setup achieves this by running "seed.ts". You can put whatever you want in it: the "client" variable is a `node-postgres` Client.

To reinitialise your database in dev, run

```sh
npm run reset-db
```

This migrates back to the empty database, then up to your latest schema, and runs `seed` afterwards.

If you add a version, and just want to migrate up, you can run

```sh
npm run setup:db
```

Similarly, to migrate to a specific version, run

```sh
npm run setup:db -- <version>
```

If you just want to run the seed script, call

```sh
npm run setup:seed
```

## Developing against the Kwaito stack

- If you did not ask to run npm install, you need to explicitly init the stack. Do so by running 

  ```sh
  npx remix init
  ```
- You probably also want to init your vcs here. For git, do this:

  ```sh
  git init # if you haven't already
  git add .
  git commit -m "Initialize project"
  ```

- Start the Postgres Database in [Docker](https://www.docker.com/get-started):

  ```sh
  npm run docker
  ```

  > **Note:** The npm script will complete while Docker sets up the container in the background. Ensure that Docker has finished and your container is running before proceeding.

- Initial setup:

  ```sh
  npm run setup
  ```

- Run the first build:

  ```sh
  npm run build
  ```

- Start dev server:

  ```sh
  npm run dev
  ```

This starts your app in development mode, rebuilding assets on file changes.

Your database is empty to start off. Create a schema as described in [setting up the database](#setting-up-your-database).

- Email: `rachel@remix.run`
- Password: `racheliscool`

If you'd prefer not to use Docker, you can also use Fly's Wireguard VPN to connect to a development database (or even your production database). You can find the instructions to set up Wireguard [here](https://fly.io/docs/reference/private-networking/#install-your-wireguard-app), and the instructions for creating a development database [here](https://fly.io/docs/reference/postgres/).


## WARNING

Much of what is below does not reflect the current state. I'll update this when I have got things to an acceptable point.

## Quickstart

Click this button to create a [Gitpod](https://gitpod.io) workspace with the project set up, Postgres started, and Fly pre-installed (er, not sure this will work :D)

[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/idokutela/remix-kwaito-stack/tree/main)

## Development

### Relevant code:

This is very bare bones: just displays a landing page.

## Deployment

This Remix Stack comes with two GitHub Actions that handle automatically deploying your app to production and staging environments.

Prior to your first deployment, you'll need to do a few things:

- [Install Fly](https://fly.io/docs/getting-started/installing-flyctl/)

- Sign up and log in to Fly

  ```sh
  fly auth signup
  ```

  > **Note:** If you have more than one Fly account, ensure that you are signed into the same account in the Fly CLI as you are in the browser. In your terminal, run `fly auth whoami` and ensure the email matches the Fly account signed into the browser.

- Create two apps on Fly, one for staging and one for production:

  ```sh
  fly apps create kwaito-stack-template
  fly apps create kwaito-stack-template-staging
  ```

  > **Note:** Once you've successfully created an app, double-check the `fly.toml` file to ensure that the `app` key is the name of the production app you created. This Stack automatically appends a unique suffix at init. You will likely see [404 errors in your Github Actions CI logs](https://community.fly.io/t/404-failure-with-deployment-with-remix-blues-stack/4526/3) if you have this mismatch.

- Initialize Git.

  ```sh
  git init
  ```

- Create a new [GitHub Repository](https://repo.new), and then add it as the remote for your project. **Do not push your app yet!**

  ```sh
  git remote add origin <ORIGIN_URL>
  ```

- Add a `FLY_API_TOKEN` to your GitHub repo. To do this, go to your user settings on Fly and create a new [token](https://web.fly.io/user/personal_access_tokens/new), then add it to [your repo secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) with the name `FLY_API_TOKEN`.

- Add a `SESSION_SECRET` to your fly app secrets, to do this you can run the following commands:

  ```sh
  fly secrets set SESSION_SECRET=$(openssl rand -hex 32) --app kwaito-stack-template
  fly secrets set SESSION_SECRET=$(openssl rand -hex 32) --app kwaito-stack-template-staging
  ```

  > **Note:** When creating the staging secret, you may get a warning from the Fly CLI that looks like this:
  >
  > ```
  > WARN app flag 'kwaito-stack-template-staging' does not match app name in config file 'kwaito-stack-template'
  > ```
  >
  > This simply means that the current directory contains a config that references the production app we created in the first step. Ignore this warning and proceed to create the secret.

  If you don't have openssl installed, you can also use [1password](https://1password.com/password-generator/) to generate a random secret, just replace `$(openssl rand -hex 32)` with the generated secret.

- Create a database for both your staging and production environments. Run the following:

  ```sh
  fly postgres create --name kwaito-stack-template-db
  fly postgres attach --app kwaito-stack-template kwaito-stack-template-db

  fly postgres create --name kwaito-stack-template-staging-db
  fly postgres attach --app kwaito-stack-template-staging kwaito-stack-template-staging-db
  ```

  > **Note:** You'll get the same warning for the same reason when attaching the staging database that you did in the `fly set secret` step above. No worries. Proceed!

Fly will take care of setting the `DATABASE_URL` secret for you.

Now that everything is set up you can commit and push your changes to your repo. Every commit to your `main` branch will trigger a deployment to your production environment, and every commit to your `dev` branch will trigger a deployment to your staging environment.

If you run into any issues deploying to Fly, make sure you've followed all of the steps above and if you have, then post as many details about your deployment (including your app name) to [the Fly support community](https://community.fly.io). They're normally pretty responsive over there and hopefully can help resolve any of your deployment issues and questions.

### Multi-region deploys

Once you have your site and database running in a single region, you can add more regions by following [Fly's Scaling](https://fly.io/docs/reference/scaling/) and [Multi-region PostgreSQL](https://fly.io/docs/getting-started/multi-region-databases/) docs.

Make certain to set a `PRIMARY_REGION` environment variable for your app. You can use `[env]` config in the `fly.toml` to set that to the region you want to use as the primary region for both your app and database.

#### Testing your app in other regions

Install the [ModHeader](https://modheader.com/) browser extension (or something similar) and use it to load your app with the header `fly-prefer-region` set to the region name you would like to test.

You can check the `x-fly-region` header on the response to know which region your request was handled by.

## GitHub Actions

We use GitHub Actions for continuous integration and deployment. Anything that gets into the `main` branch will be deployed to production after running tests/build/etc. Anything in the `dev` branch will be deployed to staging.

## Testing

This is up to you. I'll add notes how to set various things up later.

### Type Checking

This project uses TypeScript. It's recommended to get TypeScript set up for your editor to get a really great in-editor experience with type checking and auto-complete. To run type checking across the whole project, run `npm run typecheck`.

### Linting

This project uses ESLint for linting. That is configured in `.eslintrc.js`.

### Formatting

We use [Prettier](https://prettier.io/) for auto-formatting in this project. It's recommended to install an editor plugin (like the [VSCode Prettier plugin](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)) to get auto-formatting on save. There's also a `npm run format` script you can run to format all files in the project.
