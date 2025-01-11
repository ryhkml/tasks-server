<div align="center">
    <h1>
        <b>Tasks Server</b>
    </h1>
</div>

Tasks Server is an on-premise task management service designed to execute and distribute tasks efficiently. A task is essentially an object representing a resource intended for one-time use. You can request a task, and they will be executed at a later time.

<br>

<div align="center">
	<img src="./diagram.png" alt="Diagram Tasks Server">
</div>

## Features

1. HTTP requests with selected http curl options
2. Configurable retry mechanism
3. Custom scheduling options
4. Automatically reschedules tasks if the server shuts down unexpectedly

There are two comparison tables that compare Pub/Sub and the Cron Job Scheduler.

### Tasks vs Pub/Sub

| **Feature**               | **Tasks**                                                                                                                            | **Pub/Sub**                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Purpose**               | Execute scheduled and delayed tasks                                                                                                  | Distribute messages in real-time                                                             |
| **Communication Model**   | Point-to-point (queue based)                                                                                                         | Publish/subscribe (broadcast)                                                                |
| **Scheduling**            | Yes (with flexibility)                                                                                                               | No                                                                                           |
| **Delivery Warranty**     | At-least-once delivery (with retries)                                                                                                | At-least-once delivery (duplicates are possible)                                             |
| **Delivery Rate Control** | Limited 1000 task in queue                                                                                                           | Unlimited                                                                                    |
| **Failure Handling**      | Best (with retries)                                                                                                                  | Message acknowledgment (subscribers must acknowledge messages after processing)              |
| **Use Cases**             | Processing asynchronous tasks such as sending emails or updating databases. Running scheduled tasks such as generating daily reports | Real-time data streaming or Pub/sub systems such as sending notifications or updating caches |

### Tasks vs Cron Job Scheduler

| **Feature**               | **Tasks**                                                                                                                            | **Cron Job Scheduler**                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Purpose**               | Execute scheduled and delayed tasks                                                                                                  | Schedule fully managed cron jobs                                                           |
| **Communication Model**   | Point-to-point (queue based)                                                                                                         | Point-to-point (triggers actions)                                                          |
| **Scheduling**            | Yes (with flexibility)                                                                                                               | Yes (cron-schedule fixed interval)                                                         |
| **Delivery Warranty**     | At-least-once delivery (with retries)                                                                                                | Depends entirely on the target service being triggered                                     |
| **Delivery Rate Control** | Limited 1000 task in queue                                                                                                           | Unlimited                                                                                  |
| **Failure Handling**      | Best (with retries)                                                                                                                  | No, or Depends entirely on the target service                                              |
| **Use Cases**             | Processing asynchronous tasks such as sending emails or updating databases. Running scheduled tasks such as generating daily reports | Running recurring tasks on a schedule (nightly backups, daily reports, cleanup processing) |

## Getting Started

Make sure you have a [bun](https://bun.sh/docs/installation) and optional [curl](https://curl.se/download.html). Execute the `sh` or `bash` commands demonstrated below.

To install dependencies, run:

```sh
sh install.sh
```

To update dependencies after a `git pull`, run:

```sh
sh update.sh
```

## Development

To start the development server, run:

```sh
bun run serve:dev
```

## Test

To start the test server, run:

```sh
bun run test
```

Or, test specifically by file name

```sh
bun --env-file=.env.test test <FILENAME>
```

## Single-file executable

To compile single-file executable, run:

```sh
bun run bin
```

## Docker build

To build docker image, run:

```sh
docker compose -p tasks --env-file <ENV_FILE> up -d --build
```

Task server uses Nix store when building docker image. The Nix store is an abstraction that stores immutable file system data (such as software packages) which can have dependencies on other such data. In this case, Tasks server copies the Nix store directory to a final stage that only requires the curl binary and its dependencies.

## Path configuration

You can use absolute path or current working path, for example:

```sh
# Absolute path
/tmp/tasks/tasks.db
# Current working path
.database/tasks.db
```

## API

### Owner

Each owner can have a maximum of 1000 tasks in queue.

-   ✅ `GET /v1/owners/:name`
-   ✅ `DELETE /v1/owners/:name`
-   ✅ `POST /v1/owners/register`

### Queue

A queue is a collection of tasks scheduled for later execution. Queues can be paused, resumed, and forced to execute. Their size decreases as tasks complete.

-   ✅ `GET /v1/queues`
-   ✅ `GET /v1/queues/:id`
-   ❌ `PATCH /v1/queues/:id`
-   ✅ `DELETE /v1/queues/:id`
-   ❌ `GET /v1/queues/:id/config`
-   ✅ `PATCH /v1/queues/:id/pause`
-   ✅ `PATCH /v1/queues/:id/resume`
-   ✅ `PATCH /v1/queues/:id/revoke`
-   ✅ `POST /v1/queues/register`
-   ✅ `POST /v1/queues/:id/execute`

An example of requesting a task:

```sh
curl -X POST http://localhost:9420/v1/queues/register \
    -d "..." \
    -H "Authorization: Bearer <SECRET_KEY>" \
    -H "Content-Type: application/json" \
    -H "X-Tasks-Owner-Id: <OWNER_ID>"
```

Payload:

```json
{
    "httpRequest": {
        "url": "https://target-service",
        "method": "POST"
    },
    "config": {
        "executionDelay": 86400000,
        "retry": 5,
        "retryInterval": 3600000,
        "retryExponential": false
    }
}
```

The response:

```json
{
    "id": "...",
    "state": "RUNNING",
    "createdAt": "...",
    "statusCode": 0,
    "estimateEndAt": 0,
    "estimateExecutionAt": "...",
    "response": null,
    "metadata": "..."
}
```

The example above shows a task scheduled to execute after a 1-day delay. If the task encounters a 4xx or 5xx error response, it will be retried 5 times with a 1-hour interval between each attempt. If `retryExponential` is set to `true`, the interval between retries will increase

```txt
retryInterval = 3600000ms

Retry-1: 3600000 * 1 = 3600000ms
Retry-2: 3600000 * 2 = 7200000ms
Retry-3: 3600000 * 3 = 10800000ms

And so on...
```

Alternatively, you can schedule a task to execute at a specific time using `executeAt`. By default, the task server uses **Coordinated Universal Time** ([UTC](https://currentmillis.com/tutorials/system-currentTimeMillis.html#utc)). Visit [currentmillis.com](https://currentmillis.com) to get the time in milliseconds since the UNIX epoch (January 1, 1970 00:00:00 UTC)

```json
{
    "httpRequest": {
        "url": "https://target-service",
        "method": "POST"
    },
    "config": {
        "executeAt": 1355245932000
    }
}
```

To specify a particular time zone, you can use the specific time zone offset you want, like the example below

```json
{
    "httpRequest": {
        "url": "https://target-service",
        "method": "POST"
    },
    "config": {
        "executeAt": "Dec 12 2012 12:12:12 AM +07:00"
    }
}
```

`+07:00` indicates a time zone offset of +7 hours from **Coordinated Universal Time** (UTC). This means the time is 7 hours ahead of UTC.

> [!NOTE]
>
> Properties ending with `At` are in UNIX time format, such as `executeAt`, `retryAt`, and `timeoutAt`. Using `retryAt` or `timeoutAt` will execute only once

To ensure consistent timekeeping, configure the task server to use the UTC time zone. This can be achieved by setting the `TZ` environment variable to `UTC`.

## Input File

Tasks Server allows configuring custom certificates to modify the curl options [--cacert](https://curl.se/docs/manpage.html#--cacert), [--cert](https://curl.se/docs/manpage.html#-E), and [--key](https://curl.se/docs/manpage.html#--key). To add a certificate file when the Task Server is running in a host environment, use the direct path as a curl option. For example

```json
{
    "httpRequest": {
        "url": "https://target-service",
        "method": "POST",
        "transport": "curl"
    },
    "config": {
        "executeAt": "Dec 12 2012 12:12:12 AM +07:00",
        "ca": "/tmp/ca.crt",
        "cert": {
            "value": "/tmp/fullchain.pem"
        },
        "key": "/tmp/key.pem"
    }
}
```

When running the Tasks Server in a container environment, you can

-   Create a volume. Just like the example above, adjust the path inside the container **or**
-   Use base64-encoded. To make it base64-encoded, you can use command

    ```sh
    cat /tmp/ca.crt | base64 -w 0
    ```

    ```json
    {
        "httpRequest": {
            "url": "https://target-service",
            "method": "POST",
            "transport": "curl"
        },
        "config": {
            "executeAt": "Dec 12 2012 12:12:12 AM +07:00",
            "ca": "base64...",
            "cert": {
                "value": "base64..."
            },
            "key": "base64..."
        }
    }
    ```

If there is more than one certificate, you can use multiple certificates in one file

```txt
-----BEGIN CERTIFICATE-----
...
...
-----END CERTIFICATE-----

-----BEGIN CERTIFICATE-----
...
...
-----END CERTIFICATE-----
```

## SQLite Backup

There are two backup methods:

-   **Local**. The local method copies the database file, then moves it to another directory. This method is active by default **or**
-   **Object Storage**. The [Object Storage](https://en.wikipedia.org/wiki/Object_storage) method uploads database files to an Object Storage. To authenticate to Object Storage, a compatible authentication method is required

```ts
type SqliteBackupMethod = "LOCAL" | "OBJECT_STORAGE";
```

```txt
# Backup method
BACKUP_METHOD_SQLITE=
# Endpoint. The S3-compatible service endpoint URL
BACKUP_OBJECT_STORAGE_ENDPOINT=
# Access key
BACKUP_OBJECT_STORAGE_ACCESS_KEY=
# Secret key
BACKUP_OBJECT_STORAGE_SECRET_KEY=
# Bucket name
BACKUP_OBJECT_STORAGE_BUCKET_NAME=
# Path
BACKUP_OBJECT_STORAGE_PATH=
```

Visit [Bun S3](https://bun.sh/docs/api/s3#support-for-s3-compatible-services) documentation for information on Object Storage compatibility.

## TODO

-   [ ] Create documentation
-   [ ] Create an API for editing task
-   [ ] Create an API to get task configuration
-   [x] Backup SQLite database
-   [x] Create a mechanism to reschedule tasks if the server unexpected shutdown
-   [x] Create a [cluster](https://bun.sh/guides/http/cluster) of HTTP server (Linux only)
-   [ ] Enable test coverage configuration
-   [ ] Ensure test coverage reaches 90% or more
