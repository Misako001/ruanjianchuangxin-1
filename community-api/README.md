# Community API MySQL Setup

The community backend now persists data in MySQL instead of SQLite.

## Local startup

1. Copy `community-api/.env.example` to `community-api/.env`.
2. Prepare a MySQL service in one of these two ways:
   - Use an already installed local MySQL service such as `MySQL80`.
   - Or start the bundled container with `docker compose -f docker-compose.community.yml up -d mysql`.
3. Create a dedicated app user and grant it access:

   ```sql
   CREATE DATABASE IF NOT EXISTS visiongenie_community
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE IF NOT EXISTS visiongenie_community_test
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;

   CREATE USER IF NOT EXISTS 'visiongenie'@'localhost' IDENTIFIED BY 'visiongenie123';
   CREATE USER IF NOT EXISTS 'visiongenie'@'127.0.0.1' IDENTIFIED BY 'visiongenie123';

   GRANT ALL PRIVILEGES ON visiongenie_community.* TO 'visiongenie'@'localhost';
   GRANT ALL PRIVILEGES ON visiongenie_community.* TO 'visiongenie'@'127.0.0.1';
   GRANT ALL PRIVILEGES ON visiongenie_community_test.* TO 'visiongenie'@'localhost';
   GRANT ALL PRIVILEGES ON visiongenie_community_test.* TO 'visiongenie'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

4. Fill in `community-api/.env` with your actual host, port, database, user, and password.
5. In `community-api/`, run `npm install`.
6. In `community-api/`, run `npm run dev`.

## Persistence

- Community posts, comments, likes, and favorites are stored in MySQL.
- Restarting the API does not reset existing community data.
- Seed data is inserted only when the `community_posts` table is empty.
- Only the post author can delete a post through the API.

## Tests

- Integration tests use `COMMUNITY_MYSQL_TEST_DATABASE`, not the main production-like community database.
- Run them with `RUN_COMMUNITY_MYSQL_TESTS=1 npm test`.

## Collaborator workflow

- If collaborators each point to their own local MySQL instance, their community data will persist locally after restarts, but it will not be shared across machines.
- If everyone needs to see the same community content, they must point to the same shared MySQL host and database.
