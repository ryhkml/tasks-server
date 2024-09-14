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

There are two comparison tables that compare Pub/Sub and the Cron Job Scheduler.

### Tasks vs Pub/Sub

| **Feature** | **Tasks** | **Pub/Sub** |
|---|---|---|
| **Purpose** | Execute scheduled and delayed tasks | Distribute messages in real-time |
| **Communication Model** | Point-to-point (queue based) | Publish/subscribe (broadcast) |
| **Scheduling** | Yes (with flexibility) | No |
| **Delivery Warranty** | At-least-once delivery (with retries) | At-least-once delivery (duplicates are possible) |
| **Delivery Rate Control** | Limited 1000 task in queue | Unlimited |
| **Failure Handling** | Best (with retries) | Message acknowledgment (subscribers must acknowledge messages after processing) |
| **Use Cases** | Processing asynchronous tasks such as sending emails or updating databases. Running scheduled tasks such as generating daily reports | Real-time data streaming or Pub/sub systems such as sending notifications or updating caches |

### Tasks vs Cron Job Scheduler

| **Feature** | **Tasks** | **Cron Job Scheduler** |
|---|---|---|
| **Purpose** | Execute scheduled and delayed tasks | Schedule fully managed cron jobs |
| **Communication Model** | Point-to-point (queue based) | Point-to-point (triggers actions) |
| **Scheduling** | Yes (with flexibility) | Yes (cron-schedule fixed interval) |
| **Delivery Warranty** | At-least-once delivery (with retries) | Depends entirely on the target service being triggered |
| **Delivery Rate Control** | Limited 1000 task in queue | Unlimited |
| **Failure Handling** | Best (with retries) | No, or Depends entirely on the target service |
| **Use Cases** | Processing asynchronous tasks such as sending emails or updating databases. Running scheduled tasks such as generating daily reports | Running recurring tasks on a schedule (nightly backups, daily reports, cleanup processing) |

## Getting Started
Make sure you have [bun](https://bun.sh/docs/installation) installed, run:
```sh
./install.sh
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
# Or test specifically the file name
bun --env-file=.env.test test <FILENAME>
```

## Single-file executable
To compile single-file executable, run:
```sh
bun run bin
```

❌ ## Docker or Podman build

## Path configuration
You can use absolute path or current working path, for example:
```sh
# Absolute path
/tmp/tasks/tasks.db
# Current working path
.database/tasks.db
```

## APIs
### Owner
- ✅ `GET /v1/owners/:name`
- ✅ `DELETE /v1/owners/:name`
- ✅ `POST /v1/owners/register`

### Queue
- ✅ `GET /v1/queues`
- ✅ `GET /v1/queues/:id`
- ❌ `PATCH /v1/queues/:id`
- ✅ `DELETE /v1/queues/:id`
- ❌ `GET /v1/queues/:id/config`
- ✅ `PATCH /v1/queues/:id/pause`
- ✅ `PATCH /v1/queues/:id/resume`
- ✅ `PATCH /v1/queues/:id/revoke`
- ✅ `POST /v1/queues/register`

❌ ## Documentation

To make it base64 content encoding, you can use the shell command
```sh
cat cert.pem | base64 -w 0
```
An example of requesting a task
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
The response
```json
{
    "id": "...",
    "state": "RUNNING",
    "createdAt": "...",
    "statusCode": 0,
    "estimateEndAt": 0,
    "estimateExecutionAt": "...",
    "response": null
}
```

The example above, the task will be executed after waiting for 1 day. If the task receives a 4xx-5xx error response, it will be run again 5 times with a 1-hour interval between each execution. If `retryExponential = true`, the interval between each execution will increase

```txt
retryInterval = 3600000ms

Retry-1: 3600000 * 1 = 3600000ms
Retry-2: 3600000 * 2 = 7200000ms
Retry-3: 3600000 * 3 = 10800000ms

And so on...
```
Additionally, you can make a specific request by using `executeAt`
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
or
```json
{
    "httpRequest": {
        "url": "https://target-service",
        "method": "POST"
    },
    "config": {
        "executeAt": "Dec 12 2012 12:12:12 AM"
    }
}
```

❌ ## SQLite Backup